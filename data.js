// 回転寿司の皿タワー / SUSHI PLATE TOWER  文言・皿・称号。処理は game.js
'use strict'
window.ST_DATA = {
  GAME_SEC: 45,
  CEIL: 34,          // この枚数で天井に届く
  CM_PER_PLATE: 3.2, // 表示用の高さ（1枚あたり cm）
  BREAK_FEE: 500,    // 割った皿の弁償代（1枚）

  // 皿。r=半径（小さいほど次が載せにくい） m=重さ（重いほど揺れる）
  PLATES: [
    { id: 'white', price: 120, r: 0.56, m: 1.0, col: 0xf3efe6, rim: 0xc9bfae, css: '#efe9dc', ja: '白皿', en: 'White', neta: ['tamago', 'kappa'] },
    { id: 'blue', price: 180, r: 0.52, m: 1.1, col: 0x3d7bd9, rim: 0x1f4f99, css: '#3d7bd9', ja: '青皿', en: 'Blue', neta: ['salmon', 'ebi'] },
    { id: 'red', price: 280, r: 0.48, m: 1.3, col: 0xd83a34, rim: 0x8f1d1a, css: '#d83a34', ja: '赤皿', en: 'Red', neta: ['maguro', 'hamachi'] },
    { id: 'gold', price: 480, r: 0.42, m: 1.6, col: 0xe2b33c, rim: 0x9c7414, css: '#d9a92f', ja: '金皿', en: 'Gold', neta: ['otoro'] },
    { id: 'black', price: 880, r: 0.37, m: 2.0, col: 0x24201f, rim: 0xc9a043, css: '#2a2422', ja: '黒皿', en: 'Black', neta: ['uni', 'ikura'] },
    { id: 'wasabi', price: 0, r: 0.56, m: 1.0, col: 0xf3efe6, rim: 0x6fae3a, css: '#8cc63f', ja: 'わさび', en: 'Wasabi', neta: ['wasabi'] },
  ],

  // 称号。score = 積んだ枚数（崩したら半分）。上から判定
  TIERS: [
    { id: 'lord', min: 24, color: '#c9302c', ja: '回転寿司の塔主', en: 'Lord of the Sushi Tower', lja: '天井が、近い。', len: 'The ceiling is within reach.' },
    { id: 'master', min: 17, color: '#d9822b', ja: '皿積みの匠', en: 'Plate-Stacking Master', lja: '板前が手を止めて見ていた。', len: 'The chef stopped working to watch.' },
    { id: 'regular', min: 11, color: '#2f7d4f', ja: '名物常連さん', en: 'Legendary Regular', lja: '店に写真が貼られるレベル。', len: 'Your photo goes on the wall.' },
    { id: 'normal', min: 6, color: '#3b6fb6', ja: 'ふつうのお客様', en: 'Just a Customer', lja: 'ごちそうさまでした。', len: 'Thank you for dining with us.' },
    { id: 'tea', min: 0, color: '#6b7a5a', ja: 'お茶ばっかり飲む人', en: 'The One Who Only Drinks Tea', lja: 'お茶、おかわり自由です。', len: 'Free tea refills, at least.' },
  ],
  BREAKER: { id: 'breaker', color: '#5b2a86', ja: '皿の破壊神', en: 'God of Plate Destruction', lja: '店じゅうが静まり返った。', len: 'The whole shop went silent.' },

  TXT: {
    ja: {
      title1: '回転寿司の', title2: '皿タワー', sub: '食べた皿を、天井まで積み上げろ。',
      start: 'いらっしゃいませ', how: '遊び方', back: 'もどる',
      howTitle: '遊び方',
      how1: '皿が線と重なった瞬間にタップ', how1b: 'タワーの真上から落ちる光の線。そこを通る皿を取って食べ、タワーに積む。',
      how2: 'ずれるほどタワーが傾く', how2b: 'ぴったりなら「ピタッ」。ずれすぎると皿がすべり落ちて割れる。高いほど揺れる。',
      how3: '高い皿は小さくて重い', how3b: '金皿・黒皿は高額だが積みにくい。わさびの塊は食べると涙で手元が狂う。',
      ctrlTouch: '画面のどこでもタップ', ctrlPc: 'クリック / スペースキーで取る　P で一時停止',
      tutTouch: '線と皿が重なったらタップ', tutPc: '線と皿が重なったらスペース',
      paused: '一時停止', resume: 'つづける', toTitle: 'タイトルへ',
      plates: '枚', cm: 'cm', yen: '円', sec: '秒',
      hudPlates: '皿', hudBill: 'お会計', combo: 'ピタッ×{n}',
      perfect: 'ピタッ！', good: 'よしっ', ok: 'セーフ', slip: 'すべった！', miss: 'スカッ',
      wobble: 'グラグラ', crash: 'ガシャーン！！', ceiling: '天井到達！！', timeup: 'おあいそ〜！', go: 'いただきます！', last: 'ラストスパート！',
      warnElbow: '隣の肘が来る！', warnBoat: '舟盛りが通る！', warnWasabi: 'わさび注意',
      sayElbow: 'うんまっ！', sayBoat: '舟盛り通りまーす！', sayBoatSafe: 'セーフでーす！', sayBoatHit: 'あっ…',
      sayChef10: 'お客さん、よく食うねぇ', sayChef18: 'それ以上は…やめときな！', sayChef24: '大将、天井が近いっす！',
      sayCrashChef: 'お客様ーっ！！', sayCrashStaff: 'お客様ーっ！', sayCrashMe: 'ひぃぃ…',
      sayWasabi: 'ツーン！！', sayPerfect: ['ピタッ', 'うまい！', 'いい皿'], saySlip: ['あっ', 'ああっ', 'ひぇっ'], sayPanic: ['やばいやばい', 'ゆれてる！', 'たのむ…'],
      sayCeil: '天井だーっ！',
      receiptShop: '回転ずし 皿タワー店', receiptNo: 'お会計伝票', receiptSub: '小計', receiptTax: '消費税(10%)', receiptTotal: '合計',
      receiptBreak: '割れた皿の弁償', receiptNote: '※当店は皿を積む場所ではございません',
      resCount: '積んだ皿', resHeight: '高さ', resCollapsed: '崩壊', resCeil: '天井到達', resBest: '自己ベスト',
      again: 'もう一回', save: '画像を保存', saved: '画像を保存しました',
      shareText: '回転寿司の皿タワーで「{t}」でした。{n}枚・お会計{b}円 #回転寿司の皿タワー',
      cardTitle: '回転寿司の皿タワー',
    },
    en: {
      title1: 'SUSHI', title2: 'PLATE TOWER', sub: 'Stack every plate you eat. All the way to the ceiling.',
      start: 'Take a seat', how: 'How to play', back: 'Back',
      howTitle: 'How to play',
      how1: 'Tap when a plate crosses the light', how1b: 'A beam falls from the top of your tower. Grab the plate passing through it, eat, stack.',
      how2: 'Off-center makes it lean', how2b: 'Dead center is a "Perfect". Too far off and the plate slides off and smashes. Taller towers sway more.',
      how3: 'Pricey plates are small and heavy', how3b: 'Gold and black plates cost more but stack worse. Eat the wasabi lump and your tears ruin your aim.',
      ctrlTouch: 'Tap anywhere on the screen', ctrlPc: 'Click / Space to grab.  P to pause',
      tutTouch: 'Tap when the plate meets the light', tutPc: 'Press Space when the plate meets the light',
      paused: 'Paused', resume: 'Resume', toTitle: 'Title',
      plates: '', cm: 'cm', yen: ' yen', sec: 's',
      hudPlates: 'Plates', hudBill: 'Bill', combo: 'Perfect x{n}',
      perfect: 'PERFECT!', good: 'Nice', ok: 'Close one', slip: 'SLIPPED!', miss: 'Whiff',
      wobble: 'WOBBLE', crash: 'CRASH!!', ceiling: 'CEILING!!', timeup: 'Check, please!', go: 'Itadakimasu!', last: 'Last spurt!',
      warnElbow: 'Elbow incoming!', warnBoat: 'Sushi boat coming!', warnWasabi: 'Wasabi!',
      sayElbow: 'So good!', sayBoat: 'Sushi boat, coming through!', sayBoatSafe: 'All clear!', sayBoatHit: 'Oops...',
      sayChef10: 'You sure can eat!', sayChef18: 'Please... stop there!', sayChef24: 'Boss, it is hitting the ceiling!',
      sayCrashChef: 'SIIIIR!!', sayCrashStaff: 'Sir, nooo!', sayCrashMe: 'eeek...',
      sayWasabi: 'MY NOSE!!', sayPerfect: ['Perfect', 'Yum!', 'Nice plate'], saySlip: ['Oh no', 'Aaah', 'Eep'], sayPanic: ['No no no', 'It is swaying!', 'Please hold...'],
      sayCeil: 'Ceiling!!',
      receiptShop: 'SUSHI TOWER Conveyor Bar', receiptNo: 'GUEST CHECK', receiptSub: 'Subtotal', receiptTax: 'Tax (10%)', receiptTotal: 'TOTAL',
      receiptBreak: 'Broken plates', receiptNote: '* Plates are not for stacking.',
      resCount: 'Plates', resHeight: 'Height', resCollapsed: 'Collapsed', resCeil: 'Ceiling', resBest: 'Best',
      again: 'Play again', save: 'Save image', saved: 'Image saved',
      shareText: 'I got "{t}" in SUSHI PLATE TOWER. {n} plates, bill {b} yen #SushiPlateTower',
      cardTitle: 'SUSHI PLATE TOWER',
    },
  },
}
