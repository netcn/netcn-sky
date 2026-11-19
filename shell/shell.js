/* ============================================================
   netcn 统一运行时内核 · v20261119b1
   ------------------------------------------------------------
   五站共用一份：判站、明暗、中英字典、顶栏/页脚/搜索/无障碍文案、
   首页标题、移动端 App 底部 Tab、状态栏颜色、PWA 安装钩子。
   各站业务核心（检索 / 题库 / 游戏 / 气象）仍完全独立，不在此文件内。

   2026-11-18：五个 netcn 站统一为同一套「五站 + 三外站」入口。
   顶栏 / 页脚 / 底部 Tab 都由本文件补齐缺失的外站链接与免责声明，
   这样 1,662 个既有 HTML 不需要逐个改也能保持同一顺序。
   事件契约不变：ncn:theme / ncn:lang 仍是唯一真源。
   ============================================================ */
(function () {
  'use strict';
  var d = document, r = d.documentElement;
  var host = (location.hostname || '').replace(/^www\./, '');
  var key = /^ask\./.test(host) ? 'ask' : /^quiz\./.test(host) ? 'quiz'
    : /^game\./.test(host) ? 'game' : /^sky\./.test(host) ? 'sky' : 'nav';
  var path = (location.pathname || '').split('/')[1] || '';
  var local = host === 'localhost' || host === '127.0.0.1';
  if (local) {
    /* 8802/8803 是两站独立根服务，路径里没有站名前缀，按端口判站；
       否则 ask 内页 /topic/... 会被误判成 nav，品牌名渲染错站。 */
    if (location.port === '8802') key = 'ask';
    else if (location.port === '8803') key = 'sky';
    else if (path === 'quiz' || path === 'game' || path === 'ask' || path === 'sky') key = path;
    else if (path === 'home') key = 'nav';
  }
  var force = (location.search.match(/[?&]nc=(nav|ask|quiz|game|sky)/) || [])[1];
  if (force) key = force;
  /* 本地预览 8123 等未登记端口无法靠 host/端口判站；页面可显式声明。 */
  var declared = (d.querySelector('meta[name="nc-site"]') || {}).content;
  if (declared && ['nav', 'ask', 'quiz', 'game', 'sky'].indexOf(declared) >= 0) key = declared;

  var SITES = ['nav', 'ask', 'quiz', 'game', 'sky'];
  var URL_LIVE = {
    nav: 'https://netcn.org/', ask: 'https://ask.netcn.org/', quiz: 'https://quiz.netcn.org/',
    game: 'https://game.netcn.org/', sky: 'https://sky.netcn.org/'
  };
  /* 本地预览用三套静态服务（repo root / ask/www / sky），端口与验收脚本一致 */
  var URL_LOCAL = {
    nav: 'http://127.0.0.1:8801/home/', ask: 'http://127.0.0.1:8802/?nc=ask',
    quiz: 'http://127.0.0.1:8801/quiz/', game: 'http://127.0.0.1:8801/game/',
    sky: 'http://127.0.0.1:8803/?nc=sky'
  };
  var URLS = local ? URL_LOCAL : URL_LIVE;
  var ICON = { nav: '🧭', ask: '🔬', quiz: '🧩', game: '🕹️', sky: '🌇' };
  /* 三个站群外站：不再只挂在 nav 首页；五站顶栏/页脚/Tab 都补齐。 */
  var EXTRA_TAB = [
    { key: 'chenhua', href: 'https://chenhua.net/', icon: '🖼️' },
    { key: 'xiqi', href: 'https://xiqiqi.com/', icon: '🔮' },
    { key: 'chidu', href: 'https://chidu.org/', icon: '📐' }
  ];

  /* ---------- 1. 全站中英字典（唯一真源） ---------- */
  var I18N = {
    zh: {
      site: { nav: '导航', ask: '科学问答', quiz: '头脑体操', game: '游戏厅', sky: '火烧云', chenhua: '出尘入画', xiqi: '稀奇奇', chidu: '尺度' },
      tab: { nav: '导航', ask: '问答', quiz: '脑力', game: '游戏', sky: '观天', chenhua: '尘画', xiqi: '稀奇', chidu: '尺度' },
      brand: { nav: '简洁导航', ask: '科学问答', quiz: '头脑体操', game: '游戏厅', sky: '火烧云' },
      ph: {
        nav: '搜索站点...', ask: '搜索科学问题，或随便逛逛…', quiz: '搜索 1,166 题…',
        game: '搜索游戏…（按 / 聚焦）', sky: '搜城市，如 上海 / 敦煌'
      },
      footNote: '© 2011–2026 netcn.org',
      footSite: {
        nav: '900+ 站点',
        ask: '1,057 题 · 93 篇深度 Hub',
        quiz: '1,166 题',
        game: '53 款游戏',
        sky: '518 城 · 数据仅供参考'
      },
      title: {
        nav: '简洁导航 - 精选网址导航 | netcn.org',
        ask: '科学问答 · 93 篇深度 Hub + 1,057 题 | ask.netcn.org',
        quiz: '头脑体操 - 1,166 道脑筋急转弯·猜字谜·猜谜语·智力测试',
        game: '游戏厅 · 53 款游戏 | netcn.org',
        sky: '火烧云 · 今晚晚霞、朝霞、星空、月亮观测指南'
      },
      themeDark: '切换为深色', themeLight: '切换为浅色',
      langToEn: '切换到英文', langToZh: '切换到中文',
      aHome: '返回首页', aNav: 'netcn 站点导航', aSites: 'netcn 站点',
      aSearch: '搜索', aTab: '站点切换',
      installTitle: '把 netcn 装到桌面，用起来更像 App', installBtn: '安装', installNo: '不用了'
    },
    en: {
      site: { nav: 'Nav', ask: 'Science Q&A', quiz: 'Brain Teasers', game: 'Arcade', sky: 'Sky Watch', chenhua: 'Chenhua', xiqi: 'Xiqiqi', chidu: 'Chidu' },
      tab: { nav: 'Nav', ask: 'Ask', quiz: 'Quiz', game: 'Games', sky: 'Sky', chenhua: 'Chenhua', xiqi: 'Xiqiqi', chidu: 'Chidu' },
      brand: { nav: 'Simple Nav', ask: 'Science Q&A', quiz: 'Brain Teasers', game: 'Arcade', sky: 'Sky Watch' },
      ph: {
        nav: 'Search sites...', ask: 'Search science questions, or just wander…',
        quiz: 'Search 1,166 questions...', game: 'Search games...', sky: 'Search a city, e.g. Shanghai'
      },
      footNote: '© 2011–2026 netcn.org',
      footSite: {
        nav: '900+ sites',
        ask: '1,057 Q · 93 hubs',
        quiz: '1,166 puzzles',
        game: '53 games',
        sky: '518 cities · for reference'
      },
      title: {
        nav: 'Simple Nav - A clean start page | netcn.org',
        ask: 'Science Q&A · 93 hubs, 1,057 questions | ask.netcn.org',
        quiz: 'Brain Teasers · 1,166 Chinese wordplay & IQ puzzles | quiz.netcn.org',
        game: 'Arcade · 53 games, play instantly | game.netcn.org',
        sky: "Sky Watch · Tonight's sunset, stars & moon outlook | sky.netcn.org"
      },
      themeDark: 'Switch to dark', themeLight: 'Switch to light',
      langToEn: 'Switch to English', langToZh: 'Switch to Chinese',
      aHome: 'Home', aNav: 'netcn site navigation', aSites: 'netcn sites',
      aSearch: 'Search', aTab: 'Switch site',
      installTitle: 'Install netcn for an app-like experience', installBtn: 'Install', installNo: 'No thanks'
    }
  };
  /* 静态 HTML 里的中文 aria-label → 字典键（双向，保证切回中文也能还原） */
  var ARIA = {
    '返回首页': 'aHome', 'Home': 'aHome',
    'netcn 站点导航': 'aNav', 'netcn site navigation': 'aNav',
    'netcn 站点': 'aSites', 'netcn sites': 'aSites',
    '搜索': 'aSearch', 'Search': 'aSearch',
    '站点切换': 'aTab', 'Switch site': 'aTab'
  };

  /* ---------- 2. 跨子域状态 ---------- */
  var LKEY = { game: 'arcade_lang' };
  var lkey = LKEY[key] || 'lang';
  /* 同名 cookie 可能并存：早期版本未设 Domain，留下了 host-only 版本；
     之后又写了 .netcn.org 版本。浏览器发送时两者都会带上，取第一个会
     读到旧值 → 表现为「切了暗色，回到某个站又变回去」。这里取最后一个
     （同 path 下按创建时间排序，新写的在后），写入时先清掉两种旧值。 */
  function get(n) {
    var parts = (d.cookie || '').split(/;\s*/), out = '';
    for (var i = 0; i < parts.length; i++) {
      var p = parts[i].indexOf('=');
      if (p > 0 && parts[i].slice(0, p) === n) out = decodeURIComponent(parts[i].slice(p + 1));
    }
    return out;
  }
  function put(n, v) {
    var dom = /(^|\.)netcn\.org$/.test(host) ? '; Domain=.netcn.org' : '';
    try {
      d.cookie = n + '=; Path=/; Max-Age=0; SameSite=Lax';
      if (dom) d.cookie = n + '=; Path=/; Max-Age=0; SameSite=Lax' + dom;
    } catch (e) {}
    d.cookie = n + '=' + encodeURIComponent(v) + '; Path=/; Max-Age=31536000; SameSite=Lax' + dom;
  }
  var ct = get('ncn_theme'), cl = get('ncn_lang');
  try {
    if (ct && ct !== localStorage.getItem('theme')) localStorage.setItem('theme', ct);
    if (cl && cl !== localStorage.getItem(lkey)) localStorage.setItem(lkey, cl);
  } catch (e) {}

  function sysDark() { try { return !!(window.matchMedia && matchMedia('(prefers-color-scheme: dark)').matches); } catch (e) { return false; } }
  function validTheme(v) { return v === 'dark' || v === 'light' ? v : ''; }
  /* 优先级：运行时已应用的 data-theme → 本域记忆 → 全域 cookie → 系统偏好。
     cookie 兜底是为了跨子域：五个站 localStorage 互不相通，只有 .netcn.org 的
     cookie 能把「用户在别的站选过的明暗」带过来。 */
  function curTheme() {
    var a = validTheme(r.getAttribute('data-theme'));
    if (a) return a;
    try { var s = validTheme(localStorage.getItem('theme')); if (s) return s; } catch (e) {}
    var c = validTheme(get('ncn_theme'));
    if (c) return c;
    return sysDark() ? 'dark' : 'light';
  }
  var DEFLANG = { quiz: 'zh' };
  function curLang() {
    var s = null; try { s = localStorage.getItem(lkey); } catch (e) {}
    return s || DEFLANG[key] || (/^zh/.test((navigator.language || '').toLowerCase()) ? 'zh' : 'en');
  }
  function T(l) { return I18N[l === 'en' ? 'en' : 'zh']; }

  /* ---------- 3. 全站文案重渲染（幂等） ---------- */
  function isHome() {
    var p = (location.pathname || '').replace(/index\.html$/, '');
    return p === '/' || p === '' || (local && /^\/(home|quiz|game|sky|ask\/www)\/$/.test(p));
  }
  /* 现有 1,662 个 HTML 只写入了五站入口；三个外站和免责声明由这里补齐。
     只在缺失时追加，主站已经静态写死的 8 项不会被重复插入。 */
  /* 内页（尤其头脑体操 1,200+ 道题）历史上只写了站内工具，没有主题/语言键。
     在这些页面补上同一组控件；游戏详情页由另一条适配线处理，避免插手。 */
  function ensureTools() {
    if (key === 'game') return;
    var l = curLang();
    var shell = d.querySelector('.nc-shell');
    if (!shell) return;
    var tools = shell.querySelector('.nc-tools');
    if (!tools) {
      tools = d.createElement('div');
      tools.className = 'nc-tools';
      shell.appendChild(tools);
    }
    if (!d.getElementById('ncTheme')) {
      var th = d.createElement('button');
      th.className = 'nc-tool'; th.id = 'ncTheme'; th.type = 'button';
      th.setAttribute('aria-label', l === 'en' ? 'Switch to dark' : '切换明暗');
      th.textContent = '☾';
      tools.appendChild(th);
    }
    if (!d.getElementById('ncLang')) {
      var lg = d.createElement('button');
      lg.className = 'nc-tool'; lg.id = 'ncLang'; lg.type = 'button';
      lg.setAttribute('aria-label', l === 'en' ? 'Switch to Chinese' : '切换到英文');
      lg.textContent = l === 'en' ? 'ZH' : 'EN';
      tools.appendChild(lg);
    }
  }
  function ensureShell() {
    var l = curLang(), t = T(l);
    ['.nc-sw', '.nc-foot-nav'].forEach(function (sel) {
      var box = d.querySelector(sel);
      if (!box) return;
      EXTRA_TAB.forEach(function (item) {
        if (box.querySelector('[data-nc-to="' + item.key + '"]')) return;
        var a = d.createElement('a');
        a.href = item.href;
        a.setAttribute('data-nc-to', item.key);
        if (sel === '.nc-sw') a.className = 'nc-sw-ext';
        else a.className = 'nc-foot-ext';
        a.textContent = t.site[item.key];
        box.appendChild(a);
      });
    });
    [].slice.call(d.querySelectorAll('.nc-foot')).forEach(function (foot) {
      if (foot.querySelector('.nc-foot-legal')) return;
      var a = d.createElement('a');
      a.className = 'nc-foot-legal';
      a.href = 'https://netcn.org/disclaimer/';
      a.textContent = l === 'en' ? 'Disclaimer' : '免责声明';
      a.setAttribute('data-zh', '免责声明');
      a.setAttribute('data-en', 'Disclaimer');
      var site = foot.querySelector('.nc-foot-site');
      if (site) foot.insertBefore(a, site); else foot.appendChild(a);
    });
    ensureTools();
  }
  function applyI18n(l) {
    var t = T(l);
    /* 站名：顶栏与页脚，按 data-nc-to 定位，与静态文案无关 */
    [].slice.call(d.querySelectorAll('.nc-sw a[data-nc-to],.nc-foot-nav a[data-nc-to]')).forEach(function (a) {
      var k = a.getAttribute('data-nc-to');
      if (t.site[k]) a.textContent = t.site[k];
    });
    /* 品牌名 */
    [].slice.call(d.querySelectorAll('.nc-brand-txt')).forEach(function (e) { if (t.brand[key]) e.textContent = t.brand[key]; });
    /* 搜索框 */
    [].slice.call(d.querySelectorAll('.nc-search input')).forEach(function (e) {
      e.setAttribute('placeholder', t.ph[key]);
      e.setAttribute('aria-label', t.aSearch);
    });
    /* 无障碍标签：中文与英文写法都能还原 */
    [].slice.call(d.querySelectorAll('[aria-label]')).forEach(function (e) {
      var a = e.getAttribute('aria-label');
      if (ARIA[a]) e.setAttribute('aria-label', t[ARIA[a]]);
    });
    /* 工具按钮 */
    var th = d.getElementById('ncTheme'), lg = d.getElementById('ncLang');
    if (th) {
      th.textContent = curTheme() === 'dark' ? '☀' : '☾';
      th.setAttribute('aria-label', curTheme() === 'dark' ? t.themeLight : t.themeDark);
    }
    if (lg) {
      lg.textContent = l === 'en' ? 'ZH' : 'EN';
      lg.setAttribute('aria-label', l === 'en' ? t.langToZh : t.langToEn);
    }
    /* 页脚 */
    [].slice.call(d.querySelectorAll('.nc-foot-note')).forEach(function (e) { e.textContent = t.footNote; });
    [].slice.call(d.querySelectorAll('.nc-foot-site')).forEach(function (e) {
      /* 火烧云城市页自带 data-zh/data-en 且含站内链接，交给页面自己的双语逻辑；
         其余站（含 home 的静态双语属性）一律由统一字典渲染 */
      if (key === 'sky' && e.hasAttribute('data-zh') && e.hasAttribute('data-en')) return;
      e.innerHTML = t.footSite[key];
    });
    [].slice.call(d.querySelectorAll('.nc-foot-legal')).forEach(function (a) {
      a.textContent = l === 'en' ? 'Disclaimer' : '免责声明';
    });
    /* 首页标题（内页标题保留，避免破坏 SEO） */
    if (isHome() && t.title[key]) d.title = t.title[key];
    /* 底部 Tab */
    var bar = d.querySelector('.nc-tabbar');
    if (bar) {
      bar.setAttribute('aria-label', t.aTab);
      [].slice.call(bar.querySelectorAll('a[data-nc-to]')).forEach(function (a) {
        var k = a.getAttribute('data-nc-to'), tx = a.querySelector('.nc-tab-tx');
        var label = t.tab[k];
        if (tx && label) tx.textContent = label;
      });
    }
    r.setAttribute('data-nc-lang', l);
  }

  /* ---------- 4. 顶栏高亮 / 主题色 ---------- */
  function paint() {
    [].slice.call(d.querySelectorAll('.nc-shell,.nc-inner,.nc-sw,.nc-foot')).forEach(function (s) { s.setAttribute('data-nc', key); });
    [].slice.call(d.querySelectorAll('[data-nc-to]')).forEach(function (a) {
      if (a.getAttribute('data-nc-to') === key) a.setAttribute('aria-current', 'page');
    });
  }
  function themeColor(t) {
    var m = d.querySelector('meta[name="theme-color"]');
    if (!m) { m = d.createElement('meta'); m.setAttribute('name', 'theme-color'); d.head.appendChild(m); }
    m.setAttribute('content', t === 'dark' ? '#10141c' : '#fafbfc');
  }

  function applyTheme(t, silent) {
    if (t !== 'dark') t = 'light';
    r.setAttribute('data-theme', t);
    if (t === 'dark') r.classList.add('dark'); else r.classList.remove('dark');
    themeColor(t);
    var b = d.getElementById('ncTheme');
    if (b) {
      b.textContent = t === 'dark' ? '☀' : '☾';
      b.setAttribute('aria-label', T(curLang())[t === 'dark' ? 'themeLight' : 'themeDark']);
    }
    if (!silent) {
      try { localStorage.setItem('theme', t); } catch (e) {}
      put('ncn_theme', t);
      try { d.dispatchEvent(new CustomEvent('ncn:theme', { detail: { theme: t } })); } catch (e) {}
    }
  }
  function applyLang(l, silent) {
    if (l !== 'en') l = 'zh';
    try { localStorage.setItem(lkey, l); } catch (e) {}
    if (!silent) put('ncn_lang', l);
    r.setAttribute('lang', l === 'en' ? 'en' : 'zh-CN');
    applyI18n(l);
    if (!silent) {
      try { d.dispatchEvent(new CustomEvent('ncn:lang', { detail: { lang: l } })); } catch (e) {}
    }
  }

  /* ---------- 5. 移动端 App 壳：底部 Tab ---------- */
  function buildTab(l) {
    if (!d.body || d.querySelector('.nc-tabbar')) return;
    var t = T(l), bar = d.createElement('nav');
    bar.className = 'nc-tabbar';
    bar.setAttribute('aria-label', t.aTab);
    bar.setAttribute('data-nc', key);
    var tabs = SITES.map(function (k) { return { key: k, href: URLS[k], icon: ICON[k] }; }).concat(EXTRA_TAB);
    tabs.forEach(function (item) {
      var k = item.key;
      var a = d.createElement('a');
      a.href = item.href;
      a.setAttribute('data-nc-to', k);
      if (k === key) a.setAttribute('aria-current', 'page');
      var label = t.tab[k];
      a.innerHTML = '<span class="nc-tab-ic" aria-hidden="true">' + item.icon + '</span>' +
        '<span class="nc-tab-tx">' + label + '</span>';
      bar.appendChild(a);
    });
    d.body.appendChild(bar);
    d.body.classList.add('nc-has-tabbar');
  }

  /* ---------- 6. PWA 安装钩子（克制、可关闭、只提一次） ---------- */
  var deferred = null;
  function initInstall() {
    addEventListener('beforeinstallprompt', function (e) {
      e.preventDefault(); deferred = e;
      var dismissed = false;
      try { dismissed = localStorage.getItem('ncn_install_dismissed') === '1'; } catch (err) {}
      if (dismissed || matchMedia('(display-mode: standalone)').matches) return;
      if (!matchMedia('(max-width:768px)').matches) return;
      setTimeout(function () {
        if (!deferred || d.querySelector('.nc-install')) return;
        var t = T(curLang()), box = d.createElement('div');
        box.className = 'nc-install';
        box.innerHTML = '<span class="nc-install-tx">' + t.installTitle + '</span>' +
          '<button type="button" class="nc-install-go">' + t.installBtn + '</button>' +
          '<button type="button" class="nc-install-no" aria-label="×">×</button>';
        box.querySelector('.nc-install-no').addEventListener('click', function () {
          box.remove(); try { localStorage.setItem('ncn_install_dismissed', '1'); } catch (err) {}
        });
        box.querySelector('.nc-install-go').addEventListener('click', function () {
          box.remove(); if (deferred && deferred.prompt) deferred.prompt(); deferred = null;
        });
        d.body.appendChild(box);
      }, 4000);
    });
  }

  /* ---------- 7. Service Worker：全站统一注册，离线可打开 ---------- */
  function initSW() {
    if (!('serviceWorker' in navigator)) return;
    var local = location.protocol === 'https:' || location.hostname === 'localhost' || location.hostname === '127.0.0.1';
    if (!local) return;
    addEventListener('load', function () {
      navigator.serviceWorker.register('/sw.js?v=20261119c5', { scope: '/' }).catch(function (err) {
        try { console.warn('service worker registration failed', err); } catch (e) {}
      });
    });
  }

  /* ---------- 8. 初始化 ---------- */
  function init() {
    ensureShell();
    paint();
    applyTheme(curTheme(), true);
    applyLang(curLang(), true);
    buildTab(curLang());
    applyI18n(curLang());
    initInstall();
    initSW();
    /* 首次访问（用户从未手动选过）时跟随系统明暗；一旦点过切换，就以用户选择为准。 */
    try {
      var mq = window.matchMedia('(prefers-color-scheme: dark)');
      var followSystem = function () {
        var chosen = false;
        try { chosen = !!validTheme(localStorage.getItem('theme')); } catch (e) {}
        if (!chosen && !get('ncn_theme')) applyTheme(mq.matches ? 'dark' : 'light', true);
      };
      if (mq.addEventListener) mq.addEventListener('change', followSystem);
      else if (mq.addListener) mq.addListener(followSystem);
    } catch (e) {}
    d.addEventListener('click', function (e) {
      var b = e.target && e.target.closest ? e.target.closest('#ncTheme,#ncLang') : null;
      if (!b) return;
      if (b.id === 'ncTheme') applyTheme(curTheme() === 'dark' ? 'light' : 'dark');
      else applyLang(curLang() === 'zh' ? 'en' : 'zh');
    }, true);
  }
  if (d.readyState === 'loading') {
    /* 尽早重渲染一次，减少 EN 用户看到的中文闪烁 */
    d.addEventListener('readystatechange', function () { if (d.readyState === 'interactive') applyI18n(curLang()); });
    d.addEventListener('DOMContentLoaded', init);
  } else init();

  /* 页面自有开关改完后写回全域 cookie。
     只有用户真正选过主题（localStorage 有值）才写，避免把「首访跟随系统」
     固化成用户选择——否则系统切换后就不再跟随，表现为「有时不保留」。 */
  function mirror() {
    var chosen = false;
    try { chosen = !!validTheme(localStorage.getItem('theme')); } catch (e) {}
    if (chosen) put('ncn_theme', r.getAttribute('data-theme') || curTheme());
    var l = null; try { l = localStorage.getItem(lkey); } catch (e) {}
    if (l) put('ncn_lang', l);
  }
  d.addEventListener('click', function (e) {
    var b = e.target.closest ? e.target.closest('.nc-tools button,.nc-sw button,#themeToggle,#langToggle,.lang-btn,#lang,#theme') : null;
    if (b) setTimeout(mirror, 0);
  }, true);
  addEventListener('pageshow', mirror);

  /* ---------- 8. 对外 API：各站内容层可复用同一份字典 ---------- */
  window.NETCN = {
    site: key,
    lang: curLang,
    dict: I18N,
    t: function (name) { return T(curLang())[name]; },
    ph: function () { return T(curLang()).ph[key]; },
    on: function (evt, fn) { d.addEventListener(evt, fn); }
  };
})();
