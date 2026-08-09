export const pulseStyles = `
.pulse-ui {
  --pulse-pink: #ff2f92;
  --pulse-pink-soft: rgba(255, 47, 146, .14);
  --pulse-yellow: #ffe600;
  --pulse-green: #5ee49b;
  --pulse-text: #f7f7f8;
  --pulse-muted: #9f9fa8;
  --pulse-line: rgba(255,255,255,.11);
  --pulse-panel: rgba(255,255,255,.045);
  width: min(100%, 1040px);
  color: var(--pulse-text);
  font: inherit;
}
.pulse-ui, .pulse-ui * { box-sizing: border-box; }
.pulse-ui button, .pulse-ui input, .pulse-ui select { font: inherit; }
.pulse-ui button { color: inherit; }
.pulse-ui :focus-visible { outline: 3px solid rgba(255,230,0,.82); outline-offset: 3px; }
.pulse-ui__nav { display: flex; gap: 6px; padding: 0 0 26px; border-bottom: 1px solid var(--pulse-line); }
.pulse-ui__tab { border: 0; border-radius: 999px; background: transparent; color: var(--pulse-muted); padding: 9px 15px; cursor: pointer; font-weight: 700; }
.pulse-ui__tab:hover { color: var(--pulse-text); background: rgba(255,255,255,.06); }
.pulse-ui__tab[aria-current='page'] { color: white; background: var(--pulse-pink-soft); box-shadow: inset 0 0 0 1px rgba(255,47,146,.42); }
.pulse-ui__refresh { margin-left: auto; }
.pulse-ui__page { padding-top: 30px; }
.pulse-ui__page-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 24px; margin-bottom: 26px; }
.pulse-ui__eyebrow { color: var(--pulse-pink); font-size: 12px; font-weight: 800; letter-spacing: .12em; text-transform: uppercase; margin: 0 0 8px; }
.pulse-ui h2, .pulse-ui h3, .pulse-ui p { margin-top: 0; }
.pulse-ui h2 { font-size: clamp(25px, 3vw, 34px); letter-spacing: -.035em; margin-bottom: 8px; }
.pulse-ui h3 { font-size: 18px; letter-spacing: -.015em; margin-bottom: 5px; }
.pulse-ui__lede, .pulse-ui__muted { color: var(--pulse-muted); line-height: 1.55; }
.pulse-ui__lede { margin-bottom: 0; max-width: 610px; }
.pulse-ui__button { min-height: 42px; border: 1px solid var(--pulse-line); border-radius: 11px; background: rgba(255,255,255,.055); padding: 9px 14px; cursor: pointer; font-weight: 750; transition: background .15s ease, border-color .15s ease, transform .15s ease; }
.pulse-ui__button:hover { background: rgba(255,255,255,.095); border-color: rgba(255,255,255,.2); }
.pulse-ui__button:active { transform: translateY(1px); }
.pulse-ui__button:disabled { cursor: not-allowed; opacity: .45; transform: none; }
.pulse-ui__button:disabled:hover { background: rgba(255,255,255,.055); border-color: var(--pulse-line); }
.pulse-ui__button--primary { color: #08080a !important; border-color: var(--pulse-yellow); background: var(--pulse-yellow); box-shadow: 0 7px 24px rgba(255,230,0,.14); }
.pulse-ui__button--primary:hover { background: #fff04a; }
.pulse-ui__button--danger { color: #ff8dbd; border-color: rgba(255,47,146,.34); }
.pulse-ui__stats { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 12px; margin-bottom: 28px; }
.pulse-ui__stat, .pulse-ui__card, .pulse-ui__panel { border: 1px solid var(--pulse-line); background: var(--pulse-panel); border-radius: 16px; }
.pulse-ui__stat { padding: 17px 18px; min-height: 96px; }
.pulse-ui__stat-label { display: block; color: var(--pulse-muted); font-size: 12px; font-weight: 750; text-transform: uppercase; letter-spacing: .06em; margin-bottom: 9px; }
.pulse-ui__stat-value { display: block; font-size: 19px; font-weight: 800; letter-spacing: -.02em; }
.pulse-ui__status-dot { display: inline-block; width: 8px; height: 8px; border-radius: 50%; margin-right: 8px; background: var(--pulse-green); box-shadow: 0 0 0 4px rgba(94,228,155,.11); }
.pulse-ui__section-label { color: var(--pulse-muted); font-size: 13px; font-weight: 750; margin: 0 0 11px; }
.pulse-ui__list { display: grid; gap: 12px; }
.pulse-ui__card { display: flex; justify-content: space-between; gap: 24px; padding: 19px 20px; }
.pulse-ui__card--paused { opacity: .68; }
.pulse-ui__card-main { min-width: 0; }
.pulse-ui__card-title-row { display: flex; align-items: center; flex-wrap: wrap; gap: 9px; }
.pulse-ui__badge { display: inline-flex; align-items: center; border: 1px solid rgba(255,255,255,.12); border-radius: 999px; color: var(--pulse-muted); padding: 4px 8px; font-size: 11px; font-weight: 800; letter-spacing: .04em; text-transform: uppercase; }
.pulse-ui__badge--due { color: var(--pulse-yellow); border-color: rgba(255,230,0,.3); background: rgba(255,230,0,.08); }
.pulse-ui__schedule { margin: 8px 0 6px; color: #d5d5d9; }
.pulse-ui__policy { margin: 0; color: var(--pulse-muted); font-size: 13px; }
.pulse-ui__actions { align-self: center; display: flex; gap: 8px; flex: 0 0 auto; }
.pulse-ui__empty { text-align: center; padding: 48px 24px; }
.pulse-ui__empty-mark { width: 48px; height: 48px; display: grid; place-items: center; margin: 0 auto 16px; border-radius: 50%; color: var(--pulse-pink); background: var(--pulse-pink-soft); font-size: 24px; }
.pulse-ui__panel { padding: 22px; }
.pulse-ui__form { display: grid; gap: 22px; }
.pulse-ui__field { display: grid; gap: 8px; color: #e8e8ea; font-weight: 700; }
.pulse-ui__field small { color: var(--pulse-muted); font-weight: 450; line-height: 1.45; }
.pulse-ui__field input, .pulse-ui__field select { width: 100%; min-height: 45px; border: 1px solid rgba(255,255,255,.15); border-radius: 11px; color: white; background: #111115; padding: 10px 12px; }
.pulse-ui__field input:hover, .pulse-ui__field select:hover { border-color: rgba(255,255,255,.27); }
.pulse-ui__form-grid { display: grid; grid-template-columns: repeat(2, minmax(0,1fr)); gap: 16px; }
.pulse-ui__timing-grid { display: grid; grid-template-columns: repeat(2, minmax(0,1fr)); gap: 12px; }
.pulse-ui__timing { border: 1px solid var(--pulse-line); border-radius: 14px; padding: 16px; background: rgba(0,0,0,.16); }
.pulse-ui__timing h3 { font-size: 15px; }
.pulse-ui__timing p { color: var(--pulse-muted); font-size: 13px; line-height: 1.45; min-height: 38px; }
.pulse-ui__presets { display: flex; flex-wrap: wrap; gap: 6px; margin: 0 0 13px; }
.pulse-ui__preset { border: 1px solid var(--pulse-line); border-radius: 999px; background: rgba(255,255,255,.035); padding: 6px 9px; cursor: pointer; color: var(--pulse-muted) !important; font-size: 12px !important; font-weight: 750; }
.pulse-ui__preset[aria-pressed='true'] { color: white !important; border-color: rgba(255,47,146,.45); background: var(--pulse-pink-soft); }
.pulse-ui__form-actions { display: flex; justify-content: space-between; gap: 12px; padding-top: 4px; }
.pulse-ui__form-actions-group { display: flex; gap: 8px; }
.pulse-ui__history-row { display: grid; grid-template-columns: 34px minmax(0,1fr) auto; gap: 13px; align-items: center; padding: 16px 0; border-bottom: 1px solid var(--pulse-line); }
.pulse-ui__history-row:last-child { border-bottom: 0; }
.pulse-ui__history-icon { width: 30px; height: 30px; display: grid; place-items: center; border-radius: 50%; color: var(--pulse-green); background: rgba(94,228,155,.1); font-weight: 900; }
.pulse-ui__history-meta { color: var(--pulse-muted); font-size: 13px; }
.pulse-ui__settings { display: grid; gap: 12px; }
.pulse-ui__setting { display: flex; justify-content: space-between; gap: 30px; align-items: center; padding: 19px 20px; border: 1px solid var(--pulse-line); border-radius: 15px; background: var(--pulse-panel); }
.pulse-ui__setting p { color: var(--pulse-muted); margin: 5px 0 0; font-size: 13px; line-height: 1.5; }
.pulse-ui__setting code { display: block; max-width: 420px; color: #d8d8dc; overflow-wrap: anywhere; font-size: 12px; }
.pulse-ui__setting-main { min-width: 0; flex: 1; }
.pulse-ui__setting-actions { display: flex; align-items: center; gap: 10px; flex: 0 0 auto; }
.pulse-ui__folder-editor { display: grid; gap: 14px; margin-top: 18px; }
.pulse-ui__folder-editor .pulse-ui__form-actions-group { justify-content: flex-end; }
.pulse-ui__notice { margin-top: 18px; color: var(--pulse-muted); font-size: 13px; }
.pulse-ui__notice[role='alert'] { color: #ff98c4; }
.pulse-ui__connect { max-width: 700px; padding: 34px; }
.pulse-ui__connect .pulse-ui__field { margin: 24px 0 16px; }
.pulse-ui__connect-actions { display: flex; justify-content: flex-end; }
.pulse-ui__modal-backdrop { position: fixed; inset: 0; z-index: 1000; display: grid; place-items: center; padding: 24px; background: rgba(0,0,0,.72); backdrop-filter: blur(5px); }
.pulse-ui__modal { width: min(100%, 470px); padding: 25px; border: 1px solid rgba(255,255,255,.16); border-radius: 18px; color: var(--pulse-text); background: #151519; box-shadow: 0 24px 80px rgba(0,0,0,.52); }
.pulse-ui__modal-actions { display: flex; justify-content: flex-end; gap: 9px; margin-top: 24px; }
@media (max-width: 720px) {
  .pulse-ui__page-head, .pulse-ui__card, .pulse-ui__setting { align-items: stretch; flex-direction: column; }
  .pulse-ui__stats, .pulse-ui__form-grid, .pulse-ui__timing-grid { grid-template-columns: 1fr; }
  .pulse-ui__actions { align-self: stretch; }
  .pulse-ui__actions .pulse-ui__button { flex: 1; }
  .pulse-ui__setting-actions { justify-content: space-between; }
  .pulse-ui__history-row { grid-template-columns: 34px minmax(0,1fr); }
  .pulse-ui__history-meta { grid-column: 2; }
}
`;
