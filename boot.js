// 화면을 그리기 전에 할 일 (<head>에서 바로 읽는 보통 스크립트, CSP 때문에 인라인 스크립트는 쓰지 않는다)
// 1. 테마(시스템 / 라이트 / 다크)를 정한다 → 처음 열 때 깜빡이지 않게
// 2. Chrome의 "홈 화면에 추가" 신호(beforeinstallprompt)를 일찍 받아 둔다 → app.js가 버튼을 보여 준다
(function () {
  var KEY = 'yena-store.theme';
  var VALUES = ['system', 'light', 'dark'];
  // 상태 막대 색 = 바탕색 color.bg (tokens.css: 라이트 #FFFFFF / 다크 #121316)
  var BG = { light: '#FFFFFF', dark: '#121316' };

  function read() {
    try {
      var v = localStorage.getItem(KEY);
      return VALUES.indexOf(v) >= 0 ? v : 'system';
    } catch (e) {
      return 'system';
    }
  }

  function apply(value) {
    var t = VALUES.indexOf(value) >= 0 ? value : 'system';
    document.documentElement.setAttribute('data-theme', t);
    var metas = document.querySelectorAll('meta[name="theme-color"]');
    for (var i = 0; i < metas.length; i++) {
      var scheme = metas[i].getAttribute('data-scheme');
      metas[i].setAttribute('content', t === 'system' ? BG[scheme] : BG[t]);
    }
    return t;
  }

  function save(value) {
    var t = apply(value);
    try {
      localStorage.setItem(KEY, t);
    } catch (e) {}
    return t;
  }

  var boot = { themes: VALUES, readTheme: read, applyTheme: apply, saveTheme: save, installPrompt: null };
  window.YenaStoreBoot = boot;
  apply(read());

  window.addEventListener('beforeinstallprompt', function (e) {
    e.preventDefault();
    boot.installPrompt = e;
    document.dispatchEvent(new Event('yena-install-ready'));
  });
})();
