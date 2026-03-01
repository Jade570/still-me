// screen1.js

// 💡 1. 1번 화면(카드) 전용 타이머 상태
const sliderTimers = {};

/**
 * 💡 2. 50개의 카드 DOM 요소를 생성하고 컨테이너에 추가
 */
export function init(container) {
    if (!container) {
        console.error("#carriers container not found for screen1.init");
        return;
    }
    for (let s = 0; s < 50; s++) {
        let el = document.createElement('div');
        el.id = 'carrier-' + s;
        el.className = 'card inactive';
        container.appendChild(el);
    }
}

/**
 * 💡 3. 개별 플레이어 카드 DOM 업데이트 (main.js에서 이동)
 */
export function updatePlayerCard(seat, player) {
    let el = document.getElementById('carrier-' + seat);
    if (!el) return;

    el.className = player ? 'card active' : 'card inactive';

    let content;

    if (player) {
        // 💡 player 객체를 직접 받아 처리
        const { pan, slider, perc, dice } = player;
        const percValue = perc === undefined ? '–' : perc;
        const diceValue = dice === undefined ? '–' : dice.toFixed(3);

        content = `
            <b><code>Seat ${seat + 1}</code></b><br/>
            <code>Pan: ${pan.toFixed(2)}</code>
            <code id="s-${seat}-0">Slider 0: ${slider[0].toFixed(3)}</code>
            <code id="s-${seat}-1">Slider 1: ${slider[1].toFixed(3)}</code>
            <code id="s-${seat}-2">Slider 2: ${slider[2].toFixed(3)}</code>
        `;
    } else {
        content = `
            <b><code>Seat ${seat + 1}</code></b><br/>
            <code>Pan: –</code>         
            <code id="s-${seat}-0">Slider 0: –</code>
            <code id="s-${seat}-1">Slider 1: –</code>
            <code id="s-${seat}-2">Slider 2: –</code>
        `;
    }

    el.innerHTML = content;
}

/**
 * 💡 4. 모든 플레이어 카드 업데이트 (main.js에서 이동)
 */
export function updateAllPlayerCards(seats) {
    for (let s = 0; s < 50; s++) {
        // 💡 seats 배열을 인자로 받아 사용
        updatePlayerCard(s, seats[s]);
    }
}

/**
 * 💡 5. 슬라이더 값 변경 시각 효과 (main.js 소켓 핸들러에서 분리)
 */
export function flashSlider(sliderEl, direction) {
    if (!sliderEl || !direction) return;
    
    // 💡 sliderEl.id가 타이머 ID로 사용됨
    const timerId = sliderEl.id; 

    if (sliderTimers[timerId]) {
        clearTimeout(sliderTimers[timerId]);
    }

    if (direction === 'up') {
        sliderEl.classList.add('changing-red');
        sliderEl.classList.remove('changing-blue');
    } else { // direction === 'down'
        sliderEl.classList.add('changing-blue');
        sliderEl.classList.remove('changing-red');
    }

    sliderTimers[timerId] = setTimeout(() => {
        sliderEl.classList.remove('changing-red', 'changing-blue');
        delete sliderTimers[timerId];
    }, 500); // 0.5초
}

/**
 * 💡 6. 타악기(perc) 시각 효과 (main.js 소켓 핸들러에서 분리)
 */
export function flashPerc(seat) {
    const el = document.getElementById('carrier-' + seat);
    if (el) {
        el.classList.add('perc-flash');
        
        const FLASH_DURATION = 400;
        setTimeout(() => el.classList.remove('perc-flash'), FLASH_DURATION);
    }
}