const http = require("http").createServer();
const io = require("socket.io")(http, {
    // 최상위는 일단 허용. 아래 namespace.use에서 origin 검증
    cors: { origin: (origin, cb) => cb(null, true) }
});

// ===== 네임스페이스 분리 =====
// 관객쪽, https://audience.example.com 만 허용
const audience = io.of("/audience");
// audience.use((socket, next) => {
//     const origin = socket.request.headers.origin;
//     // 관객 도메인만 허용
//     if (origin === "https://audience.example.com") return next();
//     return next(new Error("forbidden"));
// });
//퍼포머쪽, 로컬에서만 접속 허용
const performer = io.of("/performer");
performer.use((socket, next) => {
    const origin = socket.request.headers.origin;
    // 로컬 앱(Origin 없거나 file://) 또는 로컬 개발 페이지 허용
    if (!origin || origin.startsWith("http://localhost")) return next();
    return next(new Error("forbidden"));
});

// ===== 플레이어(관객) 관리 =====
//최대 좌석 수
const MAX = 50;

// 좌석 배열과 역인덱스
const seats = Array(MAX).fill(null); // null | Player
const seatOf = new Map();            // socket.id -> seat idx

// ===== 유틸 =====
const clampPan = (v) => Math.max(-1, Math.min(1, v));
const parsePan = (v) => {
    const n = parseFloat(v);
    return Number.isFinite(n) ? clampPan(n) : null;
};

/** 좌석 번호를 -1..1로 균등 매핑 */
function seatToPan(seat, max) {
    if (!Number.isInteger(seat) || seat < 0) return 0;
    if (!Number.isInteger(max) || max <= 1) return 0;
    const k = Math.min(seat, max - 1);     // 범위 방어
    return (k / (max - 1)) * 2 - 1;        // 0→-1, (max-1)→1
}

// ===== 플레이어 클래스 =====
class Player {
    constructor(socketId, seat, pan, initialSlider) {
        this.id = socketId;
        this.seat = seat;
        this.pan = clampPan(pan);       // ⬅ 생성 시 확정//
        this.slider = initialSlider || [Math.random(), Math.random(), Math.random()]; // 클라이언트가 준 값을 사용. (없으면 안전장치로 랜덤값)
        this.perc = 0;
        this.dice = Math.random();
    }
    updateSlider(idx, val) { this.slider[idx] = val; }
    updatePerc(val) { this.perc = val; }
    updateDice() { this.dice = Math.random(); }
}


// 빈 좌석 찾기
function firstEmptySeat() {
    return seats.findIndex((p) => p === null);
}

// 플레이어 직렬화
function serializePlayer(p) {
    return { id: p.id, seat: p.seat, pan: p.pan, slider: p.slider, perc: p.perc, dice: p.dice };
}

io.on("connection", (s) => console.log("root connected", s.id));

// ===== 관객 연결 =====
audience.on("connection", (socket) => {
    console.log("audience connected", socket.id);
    // 💡 3. 연결 즉시 Player를 생성하지 않고, 'hello' 이벤트를 기다립니다.

    // 💡 4. 'hello' 이벤트 핸들러 추가
    socket.on("hello", (data) => {
        // 💡 (중복 방지) 이미 좌석을 받은 플레이어면 무시
        if (seatOf.has(socket.id)) return;

        const seat = firstEmptySeat();
        if (seat === -1) {
            socket.emit("full");
            socket.disconnect(true);
            return;
        }

        // 💡 5. 클라이언트가 보낸 'slider' 데이터를 가져옵니다.
        const clientSlider = data?.slider;

        const initialPan = Math.random() * 2 - 1;

        // 💡 6. 클라이언트의 랜덤값을 Player 생성자에 전달합니다.
        const player = new Player(socket.id, seat, initialPan, clientSlider);

        seats[seat] = player;
        seatOf.set(socket.id, seat);

        // 💡 7. 'hello'를 받은 후에야 퍼포머에게 'playerJoined'를 보냅니다.
        performer.emit("playerJoined", serializePlayer(player));
    });

    socket.on("updateSlider", (data) => {
        const s = seatOf.get(socket.id); if (s === undefined) return;
        const p = seats[s]; if (!p) return;
        p.updateSlider(data.idx, data.val);
        performer.emit("updateSlider", { seat: s, idx: data.idx, val: data.val });
        console.log(`updateSlider: ${socket.id} seat=${s} idx=${data.idx} val=${data.val}`);
    });

    socket.on("updatePerc", (data) => {
        const s = seatOf.get(socket.id); if (s === undefined) return;
        const p = seats[s]; if (!p) return;
        p.updatePerc(data.val ?? 1);
        performer.emit("updatePerc", { seat: s, val: p.perc });
        console.log(`updatePerc: ${socket.id} seat=${s} val=${data.val}`);
    });

    socket.on("disconnect", () => {
        const s = seatOf.get(socket.id);
        if (s !== undefined) {
            seatOf.delete(socket.id);
            seats[s] = null;
            performer.emit("playerLeft", { seat: s, id: socket.id });
        }
    });


});


// ===== 주사위(5초마다) =====
const INTERVAL_MS = 5000;
setInterval(() => {
    for (let s = 0; s < MAX; s++) {
        const p = seats[s];
        if (!p) continue;
        p.updateDice();
        performer.emit("updateDice", { seat: s, value: p.dice });
        console.log(`updateDice: seat=${s} value=${p.dice}`);
        // 로그 필요하면 여기서 기록
    }
}, INTERVAL_MS);

// ===== 퍼포머 연결(로컬에서 접속) =====
performer.on("connection", (socket) => {
    // 최초 전체 상태 전송
    console.log("performer connected", socket.id);
    socket.emit("players", seats.map((p) => (p ? serializePlayer(p) : null)));
    // 그 외에는 audience 쪽 이벤트를 수신해 위에서 계속 push됨
});

http.listen(9000, () => console.log("Server started on :9000"));
