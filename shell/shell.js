/* ============================================================
   netcn 统一运行时内核 · v20261110a1
   ------------------------------------------------------------
   五站共用一份：判站、明暗、中英字典、顶栏/页脚/搜索/无障碍文案、
   首页标题、移动端 App 底部 Tab、状态栏颜色、PWA 安装钩子。
   各站业务核心（检索 / 题库 / 游戏 / 气象）仍完全独立，不在此文件内。

   设计要点：顶栏与页脚文案不再硬编码在 1,662 个 HTML 里，
   由本文件按 data-nc-to / .nc-brand-txt / .nc-foot-* 等稳定选择器
   在运行时按语言重渲染；新增分站只改 I18N 字典。
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

  /* ---------- 1. 全站中英字典（唯一真源） ---------- */
  var I18N = {
    zh: {
      site: { nav: '导航', ask: '科学问答', quiz: '头脑体操', game: '玩游戏', sky: '火烧云' },
      tab: { nav: '首页', ask: '问答', quiz: '脑力', game: '游戏', sky: '观天' },
      brand: { nav: '简洁导航', ask: '科学问答', quiz: '头脑体操', game: '游戏厅', sky: '火烧云' },
      ph: {
        nav: '搜索站点...', ask: '搜索科学问题，或随便逛逛…', quiz: '搜索题目…（回车定位）',
        game: '搜索游戏…（按 / 聚焦）', sky: '搜城市，如 上海 / 敦煌'
      },
      footNote: '© 2011–2026 netcn.org',
      footSite: {
        nav: '900+ 站点 · 纯净无广告',
        ask: '17,305 题 · <a href="https://ask.netcn.org/trust/">来源可信度报告</a> · CC BY 4.0 署名 问答 ask.netcn.org',
        quiz: '3,193 题 · 脑筋急转弯 / 字谜 / 谜语 / 智力测试',
        game: '53 款游戏 · 打开即玩 · 纪录仅存本地',
        sky: '晚霞 · 朝霞 · 星空 · 月亮 · 流星雨 数据仅供参考'
      },
      title: {
        nav: '简洁导航 - 纯净无广告上网首页 | netcn.org',
        ask: '问答 · 科学冒险百科 · Ask · Science Q&A Encyclopedia',
        quiz: '头脑体操 - 脑筋急转弯·猜字谜·猜谜语·智力测试',
        game: '游戏街机厅 · ARCADE HALL',
        sky: '火烧云 · 今晚晚霞、朝霞、星空、月亮观测指南'
      },
      themeDark: '切换为深色', themeLight: '切换为浅色',
      langToEn: '切换到英文', langToZh: '切换到中文',
      aHome: '返回首页', aNav: 'netcn 站点导航', aSites: 'netcn 站点',
      aSearch: '搜索', aTab: '站点切换',
      installTitle: '把 netcn 装到桌面，用起来更像 App', installBtn: '安装', installNo: '不用了'
    },
    en: {
      site: { nav: 'Nav', ask: 'Science Q&A', quiz: 'Brain Teasers', game: 'Arcade', sky: 'Sky Watch' },
      tab: { nav: 'Home', ask: 'Ask', quiz: 'Quiz', game: 'Games', sky: 'Sky' },
      brand: { nav: 'Simple Nav', ask: 'Science Q&A', quiz: 'Brain Teasers', game: 'Arcade', sky: 'Sky Watch' },
      ph: {
        nav: 'Search sites...', ask: 'Search science questions, or just wander…',
        quiz: 'Search questions...', game: 'Search games...', sky: 'Search a city, e.g. Shanghai'
      },
      footNote: '© 2011–2026 netcn.org',
      footSite: {
        nav: '900+ sites · ad-free',
        ask: '17,305 questions · <a href="https://ask.netcn.org/trust/">Source credibility</a> · CC BY 4.0 · ask.netcn.org',
        quiz: '3,193 Chinese wordplay puzzles · English UI, original Chinese questions',
        game: '53 games · play instantly · high scores stay local',
        sky: 'Sunset, sunrise, stars, moon & meteors · for reference only'
      },
      title: {
        nav: 'Simple Nav - A clean, ad-free start page | netcn.org',
        ask: 'Science Q&A · 17,305 verified questions | ask.netcn.org',
        quiz: 'Brain Teasers · Chinese wordplay & IQ puzzles | quiz.netcn.org',
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
  function get(n) { var m = (d.cookie || '').match('(?:^|; )' + n + '=([^;]*)'); return m ? decodeURIComponent(m[1]) : ''; }
  function put(n, v) {
    var dom = /(^|\.)netcn\.org$/.test(host) ? '; Domain=.netcn.org' : '';
    d.cookie = n + '=' + encodeURIComponent(v) + '; Path=/; Max-Age=31536000; SameSite=Lax' + dom;
  }
  var ct = get('ncn_theme'), cl = get('ncn_lang');
  try {
    if (ct && ct !== localStorage.getItem('theme')) localStorage.setItem('theme', ct);
    if (cl && cl !== localStorage.getItem(lkey)) localStorage.setItem(lkey, cl);
  } catch (e) {}

  function sysDark() { try { return !!(window.matchMedia && matchMedia('(prefers-color-scheme: dark)').matches); } catch (e) { return false; } }
  function curTheme() { return r.getAttribute('data-theme') || (function () { try { return localStorage.getItem('theme'); } catch (e) { return null; } })() || (sysDark() ? 'dark' : 'light'); }
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
  function applyI18n(l) {
    var t = T(l);
    /* 站名：顶栏与页脚，按 data-nc-to 定位，与静态文案无关 */
    [].slice.call(d.querySelectorAll('.nc-sw a[data-nc-to],.nc-foot-nav a[data-nc-to]')).forEach(function (a) {
      var k = a.getAttribute('data-nc-to');
      if (t.site[k]) a.textContent = t.site[k];
    });
    /* 品牌名 */
    [].slice.call(d.querySelectorAll('.nc-brand-txt')).forEach(function (e) { e.textContent = t.brand[key]; });
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
      lg.textContent = l === 'en' ? '中' : 'EN';
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
    /* 首页标题（内页标题保留，避免破坏 SEO） */
    if (isHome() && t.title[key]) d.title = t.title[key];
    /* 底部 Tab */
    var bar = d.querySelector('.nc-tabbar');
    if (bar) {
      bar.setAttribute('aria-label', t.aTab);
      [].slice.call(bar.querySelectorAll('a[data-nc-to]')).forEach(function (a) {
        var k = a.getAttribute('data-nc-to'), tx = a.querySelector('.nc-tab-tx');
        if (tx && t.tab[k]) tx.textContent = t.tab[k];
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
    SITES.forEach(function (k) {
      var a = d.createElement('a');
      a.href = URLS[k];
      a.setAttribute('data-nc-to', k);
      if (k === key) a.setAttribute('aria-current', 'page');
      a.innerHTML = '<span class="nc-tab-ic" aria-hidden="true">' + ICON[k] + '</span>' +
        '<span class="nc-tab-tx">' + t.tab[k] + '</span>';
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

  /* ---------- 7. 初始化 ---------- */
  function init() {
    paint();
    applyTheme(curTheme(), true);
    applyLang(curLang(), true);
    buildTab(curLang());
    applyI18n(curLang());
    initInstall();
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

  /* 页面自有开关改完后写回全域 cookie */
  function mirror() {
    var t = r.getAttribute('data-theme') || curTheme();
    var l = null; try { l = localStorage.getItem(lkey); } catch (e) {}
    if (t) put('ncn_theme', t);
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
