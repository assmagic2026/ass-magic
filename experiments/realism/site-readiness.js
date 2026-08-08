(() => {
  "use strict";

  // This file is intentionally independent from the renderer and game modules.
  // If anything here fails, the Japanese game UI remains available.
  const LANGUAGE_STORAGE_KEY = "assmagic:language:v1";
  const SUPPORTED_LANGUAGES = new Set(["ja", "en"]);
  const DEFAULT_LANGUAGE = "ja";
  const BOOK_SUBMIT_COOLDOWN_MS = 3500;
  const JAPANESE_DESCRIPTION = "ASS MAGICの音楽と世界を、自由に飛び回って体験できる3D公式サイト。惑星を探索し、音楽を聴き、さまざまな出来事を発見してください。";
  const ENGLISH_DESCRIPTION = "Fly around a surreal 3D planet that doubles as ASS MAGIC's official site. Listen to original music and discover hidden events, entirely in your browser.";

  const messages = Object.freeze({
    ja: Object.freeze({
      "opening.planet": "ASSの惑星",
      "opening.main": "本編",
      "opening.mainDescription": "壮大で小さな救いの物語",
      "opening.chill": "Chillモード",
      "opening.chillDescription": "ただただ気持ちよく飛行",
      "menu.aboutTitle": "ASS MAGICとは",
      "menu.aboutCopy": "夫婦で活動する謎の音楽ユニット",
      "menu.legacyPlanet": "旧・ASSの惑星",
      "menu.mendako": "メンダコ",
      "menu.notYet": "まだされてません",
      "loading.planet": "ASSの惑星",
      "music.artAlt": "再生中のジャケット",
      "music.play": "再生",
      "music.next": "次の曲",
      "music.lyrics": "歌詞表示",
      "book.dialog": "記録の本",
      "book.actions": "本の操作",
      "book.write": "何か書き残す",
      "book.read": "読んでみる",
      "book.namePlaceholder": "名前（任意）",
      "book.messagePlaceholder": "何を書く？",
      "book.submit": "記す",
      "book.nextPage": "ページをめくる",
      "book.loading": "本の記録を読み込んでいます。",
      "book.shared": "この本に書いたことばは、ほかの人にも共有されます。",
      "book.sharedProduction": "この本のことばは、ほかの人にも共有されます。",
      "book.writing": "記しています。",
      "book.saved": "記しました。",
      "book.stopped": "停止中",
      "book.empty": "まだ何も書かれていません。最初のひとことを残せます。",
      "book.wait": "少し待ってから、もう一度記してください。",
      "book.required": "ひとこと書いてから記してください。",
      "book.tooLong": "文章が長すぎます。",
      "blackBox.dialog": "黒い箱",
      "blackBox.open": "開けてみる",
      "blackBox.ignore": "ほっとく",
      "blackBox.download": "保存する",
      "blackBox.catAlt": "箱の中にいた猫",
      "blackBox.caption": "かわいいのがいた。",
      "blackBox.moving": "高速移動する",
      "blackBox.captured": "黒い箱を捕獲",
      "blackBox.openAgain": "また開けちゃう",
      "blackBox.playerLine": "あなた「お前も帰りたいか？」",
      "blackBox.catLine": "猫「にゃー」",
      "runtime.servicePicker": "配信先を選ぶ",
      "runtime.continueListening": "好きなサービスで続きを聴く",
      "runtime.open": "開く ↗",
      "runtime.nowPlaying": "再生中",
      "runtime.lyricsLoading": "歌詞を読み込んでいます。",
      "runtime.lyricsMissing": "この曲の歌詞はまだありません。",
      "runtime.lyricsUnavailable": "歌詞を読み込めませんでした。",
      "runtime.devilEncounter": "悪魔に遭遇",
      "runtime.summonDevil": "悪魔を呼ぶ",
      "runtime.devilGuide": "悪魔の案内",
      "runtime.cancel": "中止",
      "runtime.creatorCopy": "創造主は、ASS MAGICという謎の音楽ユニットだ。\nそれ以上のことはわからない。\n\n本人たちさえ、一体何を作っているのかよくわかっていない。",
      "runtime.whereTo": "どこへ行きたい？",
      "runtime.whatDoYouWant": "何が望みだ？",
      "runtime.explore": "自由に探索したい",
      "runtime.needHint": "ヒントがほしい",
      "runtime.needGuide": "案内してほしい",
      "runtime.aboutCreator": "創造主について",
      "runtime.back": "戻る",
      "runtime.gotIt": "わかった",
      "runtime.oh": "へぇ",
      "runtime.escapeHint": "昼のエリアに黒い球、夜のエリアに白い球がある。\n\nどちらかの球に触れた後、30秒以内にもう片方の球に触れることで昼夜が逆転する。\n\nその後、白い球の近くの巨大な装置を起動させれば脱出の道標が現れる。",
      "runtime.destination.recordPlayer": "レコードプレイヤー",
      "runtime.destination.book": "巨大な本",
      "runtime.destination.whiteSphere": "白い球体",
      "runtime.destination.blackSphere": "黒い球体",
      "runtime.destination.compass": "羅針盤",
      "runtime.destination.sanctuary": "太陽光式集光遠達装置",
      "runtime.destination.blackBox": "高速移動する黒い箱",
      "runtime.destination.blackBoxOpened": "黒い箱",
      "music.pause": "停止",
      "music.nowPlaying": "再生中",
      "music.ready": "準備完了",
      "music.playTrack": "再生",
      "music.chooseTrack": "この惑星で流す曲を選ぶ。",
      "music.trackList": "楽曲リスト",
      "toast.catMounted": "猫が肩に飛び乗った。",
      "toast.compassAssist": "羅針盤が進行方向を整えている。",
      "skate.stanceSwitching": "スタンスを切り替え中",
      "skate.goofyToRegular": "スタンスをグーフィーからレギュラーへ切り替え",
      "skate.regularToGoofy": "スタンスをレギュラーからグーフィーへ切り替え",
      "flight.help": "右スティック・WASD・矢印で球面飛行 / 長押し・Spaceで加速",
      "ending.production": "制作",
      "ending.music": "音楽",
      "ending.artDirection": "アートディレクション",
      "ending.creativeDirection": "クリエイティブディレクション",
      "ending.cast": "出演",
      "ending.thanks": "皆様",
      "ending.returnees": "帰還成功者",
      "ending.trueReturnees": "真の帰還成功者",
      "ending.unconfirmed": "未確認",
      "ending.trueMessage": "ありがとうニャー",
      "ending.close": "閉じる",
      "a11y.language": "言語を選択",
      "a11y.selectJapanese": "日本語に切り替える",
      "a11y.selectEnglish": "英語に切り替える",
      "a11y.experienceSelection": "体験を選択",
      "a11y.experienceModes": "体験モード",
      "a11y.planetScene": "惑星全体のリアル表現負荷試験",
      "a11y.skateControls": "スケート操作",
      "a11y.musicPlayer": "音楽プレイヤー",
      "a11y.lyrics": "歌詞",
      "a11y.trackPicker": "曲を選ぶ",
      "a11y.trackList": "楽曲リスト",
      "a11y.openMendako": "メンダコを開く",
      "a11y.openLegacyPlanet": "旧・ASSの惑星を開く",
      "a11y.stanceToggle": "スタンスをレギュラーからグーフィーへ切り替え",
      "a11y.restartFlight": "最初の飛行画面に戻る",
    }),
    en: Object.freeze({
      "opening.planet": "The Planet of ASS",
      "opening.main": "Main Story",
      "opening.mainDescription": "A grand, intimate tale of salvation.",
      "opening.chill": "Chill Mode",
      "opening.chillDescription": "Simply fly, freely.",
      "menu.aboutTitle": "What is ASS MAGIC?",
      "menu.aboutCopy": "A mysterious music unit run by a married couple.",
      "menu.legacyPlanet": "The Original Planet of ASS",
      "menu.mendako": "Mendako",
      "menu.notYet": "Coming soon.",
      "loading.planet": "The Planet of ASS",
      "music.artAlt": "Album artwork for the current track",
      "music.play": "Play",
      "music.next": "Next track",
      "music.lyrics": "Show lyrics",
      "book.dialog": "The Book of Records",
      "book.actions": "Book actions",
      "book.write": "Leave a note",
      "book.read": "Read the notes",
      "book.namePlaceholder": "Name (optional)",
      "book.messagePlaceholder": "What would you like to write?",
      "book.submit": "Write it down",
      "book.nextPage": "Turn the page",
      "book.loading": "Loading the book’s records…",
      "book.shared": "Words written in this book are shared with other visitors.",
      "book.sharedProduction": "Words in this book are shared with other visitors.",
      "book.writing": "Writing…",
      "book.saved": "Written down.",
      "book.stopped": "Unavailable",
      "book.empty": "Nothing has been written yet. Leave the first note.",
      "book.wait": "Please wait a moment before writing again.",
      "book.required": "Write a short note before submitting.",
      "book.tooLong": "That note is too long.",
      "blackBox.dialog": "The Black Box",
      "blackBox.open": "Open it",
      "blackBox.ignore": "Leave it alone",
      "blackBox.download": "Save",
      "blackBox.catAlt": "The cat inside the box",
      "blackBox.caption": "Something cute was inside.",
      "blackBox.moving": "Fast-moving",
      "blackBox.captured": "Black Box Captured",
      "blackBox.openAgain": "Open it again",
      "blackBox.playerLine": "You: “Do you want to go home too?”",
      "blackBox.catLine": "Cat: “Meow.”",
      "runtime.servicePicker": "Choose a listening service",
      "runtime.continueListening": "Continue listening with your preferred service",
      "runtime.open": "Open ↗",
      "runtime.nowPlaying": "Now playing",
      "runtime.lyricsLoading": "Loading lyrics…",
      "runtime.lyricsMissing": "Lyrics are not available for this track yet.",
      "runtime.lyricsUnavailable": "Lyrics could not be loaded.",
      "runtime.devilEncounter": "A Demon Appears",
      "runtime.summonDevil": "Summon the demon",
      "runtime.devilGuide": "The demon’s guide",
      "runtime.cancel": "Cancel",
      "runtime.creatorCopy": "The creator is a mysterious music unit called ASS MAGIC.\nNothing more is known.\n\nNot even they seem to know exactly what they are making.",
      "runtime.whereTo": "Where would you like to go?",
      "runtime.whatDoYouWant": "What do you wish for?",
      "runtime.explore": "I want to explore freely",
      "runtime.needHint": "I want a hint",
      "runtime.needGuide": "Please guide me",
      "runtime.aboutCreator": "About the creator",
      "runtime.back": "Back",
      "runtime.gotIt": "Got it",
      "runtime.oh": "I see",
      "runtime.escapeHint": "There is a black sphere in the daytime area and a white sphere in the nighttime area.\n\nTouch one sphere, then touch the other within 30 seconds to reverse day and night.\n\nAfter that, activate the large device near the white sphere. A signpost for escape will appear.",
      "runtime.destination.recordPlayer": "Record Player",
      "runtime.destination.book": "Giant Book",
      "runtime.destination.whiteSphere": "White Sphere",
      "runtime.destination.blackSphere": "Black Sphere",
      "runtime.destination.compass": "Compass",
      "runtime.destination.sanctuary": "Solar Light-Concentrating Long-Distance Device",
      "runtime.destination.blackBox": "Fast-Moving Black Box",
      "runtime.destination.blackBoxOpened": "Black Box",
      "music.pause": "Pause",
      "music.nowPlaying": "Now playing",
      "music.ready": "Ready",
      "music.playTrack": "Play",
      "music.chooseTrack": "Choose music for this planet.",
      "music.trackList": "Track list",
      "toast.catMounted": "The cat jumped onto your shoulder.",
      "toast.compassAssist": "The compass is aligning your direction.",
      "skate.stanceSwitching": "Switching stance",
      "skate.goofyToRegular": "Switch stance from goofy to regular",
      "skate.regularToGoofy": "Switch stance from regular to goofy",
      "flight.help": "Fly around the planet with the right stick, WASD, or arrow keys. Hold Space to accelerate.",
      "ending.production": "Created by",
      "ending.music": "Music",
      "ending.artDirection": "Art Direction",
      "ending.creativeDirection": "Creative Direction",
      "ending.cast": "Featuring",
      "ending.thanks": "Everyone",
      "ending.returnees": "Those Who Returned",
      "ending.trueReturnees": "Those Who Truly Returned",
      "ending.unconfirmed": "Unconfirmed",
      "ending.trueMessage": "Thank you, meow.",
      "ending.close": "Close",
      "a11y.language": "Choose language",
      "a11y.selectJapanese": "Switch to Japanese",
      "a11y.selectEnglish": "Switch to English",
      "a11y.experienceSelection": "Choose an experience",
      "a11y.experienceModes": "Experience modes",
      "a11y.planetScene": "Interactive view of the planet",
      "a11y.skateControls": "Skate controls",
      "a11y.musicPlayer": "Music player",
      "a11y.lyrics": "Lyrics",
      "a11y.trackPicker": "Choose music",
      "a11y.trackList": "Track list",
      "a11y.openMendako": "Open Mendako",
      "a11y.openLegacyPlanet": "Open the Original Planet of ASS",
      "a11y.stanceToggle": "Switch stance between regular and goofy",
      "a11y.restartFlight": "Return to the first flight screen",
    }),
  });

  function safely(run, fallback) {
    try {
      return run();
    } catch (error) {
      return fallback;
    }
  }

  function readLanguage() {
    return safely(() => {
      const value = localStorage.getItem(LANGUAGE_STORAGE_KEY);
      return SUPPORTED_LANGUAGES.has(value) ? value : DEFAULT_LANGUAGE;
    }, DEFAULT_LANGUAGE);
  }

  let language = readLanguage();

  function text(key, fallback = "") {
    return messages[language]?.[key] ?? fallback;
  }

  function setMeta(name, value) {
    const selector = name.startsWith("og:") || name.startsWith("twitter:")
      ? `meta[property="${name}"], meta[name="${name}"]`
      : `meta[name="${name}"]`;
    const element = document.head.querySelector(selector);
    if (element) element.setAttribute("content", value);
  }

  function updateDocumentMetadata() {
    const isEnglish = language === "en";
    document.documentElement.lang = language;
    document.title = isEnglish
      ? "ASS MAGIC — Explore the Planet | Official Site"
      : "ASS MAGIC | Official Site";
    const description = isEnglish ? ENGLISH_DESCRIPTION : JAPANESE_DESCRIPTION;
    setMeta("description", description);
    setMeta("og:title", document.title);
    setMeta("og:description", description);
    setMeta("og:locale", isEnglish ? "en_US" : "ja_JP");
    setMeta("twitter:title", document.title);
    setMeta("twitter:description", description);
  }

  function applyTranslations(root = document) {
    if (!root?.querySelectorAll) return;
    for (const element of root.querySelectorAll("[data-ass-i18n]")) {
      element.textContent = text(element.dataset.assI18n, element.textContent);
    }
    for (const element of root.querySelectorAll("[data-ass-i18n-placeholder]")) {
      element.placeholder = text(element.dataset.assI18nPlaceholder, element.placeholder);
    }
    for (const element of root.querySelectorAll("[data-ass-i18n-aria-label]")) {
      element.setAttribute("aria-label", text(element.dataset.assI18nAriaLabel, element.getAttribute("aria-label") || ""));
    }
    for (const element of root.querySelectorAll("[data-ass-i18n-alt]")) {
      element.alt = text(element.dataset.assI18nAlt, element.alt);
    }
    const switcher = root.querySelector(".ass-language-switch");
    if (switcher) {
      switcher.setAttribute("aria-label", text("a11y.language", switcher.getAttribute("aria-label") || ""));
      for (const button of switcher.querySelectorAll("[data-ass-language]")) {
        const isCurrent = button.dataset.assLanguage === language;
        button.classList.toggle("is-active", isCurrent);
        button.setAttribute("aria-pressed", String(isCurrent));
        button.setAttribute("aria-label", text(
          button.dataset.assLanguage === "en" ? "a11y.selectEnglish" : "a11y.selectJapanese",
          button.getAttribute("aria-label") || "",
        ));
      }
    }
  }

  function installAnalytics() {
    if (!window.assAnalytics || typeof window.assAnalytics.track !== "function") {
      window.assAnalytics = {
        track() {},
      };
    }
  }

  function track(eventName) {
    safely(() => window.assAnalytics?.track?.(eventName));
  }

  function setLanguage(nextLanguage) {
    if (!SUPPORTED_LANGUAGES.has(nextLanguage) || nextLanguage === language) return;
    language = nextLanguage;
    safely(() => localStorage.setItem(LANGUAGE_STORAGE_KEY, language));
    updateDocumentMetadata();
    applyTranslations();
    track("language_changed");
    window.dispatchEvent(new CustomEvent("assmagic:locale-changed", { detail: { language } }));
  }

  function installLanguageControls() {
    for (const button of document.querySelectorAll("[data-ass-language]")) {
      const select = (event) => {
        event.preventDefault();
        event.stopPropagation();
        setLanguage(button.dataset.assLanguage);
      };
      button.addEventListener("pointerdown", (event) => event.stopPropagation());
      button.addEventListener("click", select);
    }
  }

  function setBookGuardStatus(key) {
    const status = document.querySelector("#book-status");
    if (status) status.textContent = text(key, "");
  }

  function installBookSubmitGuard() {
    const form = document.querySelector("#book-form");
    const message = document.querySelector("#book-message-input");
    if (!form || !message) return;
    let lockedUntil = 0;
    form.addEventListener("submit", (event) => {
      const now = Date.now();
      const value = String(message.value || "").trim();
      if (!value) {
        event.preventDefault();
        event.stopImmediatePropagation();
        setBookGuardStatus("book.required");
        return;
      }
      if (value.length > 280) {
        event.preventDefault();
        event.stopImmediatePropagation();
        setBookGuardStatus("book.tooLong");
        return;
      }
      if (now < lockedUntil) {
        event.preventDefault();
        event.stopImmediatePropagation();
        setBookGuardStatus("book.wait");
        return;
      }
      lockedUntil = now + BOOK_SUBMIT_COOLDOWN_MS;
    }, true);
  }

  function installRuntimeTranslationRefresh() {
    // Only invoked after user interactions; no render-loop or pointer-move work.
    document.addEventListener("click", () => {
      window.setTimeout(() => {
        const runtimeKeys = new Map([
          ["本の記録を読み込んでいます。", "book.loading"],
          ["この本に書いたことばは、ほかの人にも共有されます。", "book.shared"],
          ["記しています。", "book.writing"],
          ["記しました。", "book.saved"],
          ["停止中", "book.stopped"],
          ["配信先を選ぶ", "runtime.servicePicker"],
          ["好きなサービスで続きを聴く", "runtime.continueListening"],
          ["開く ↗", "runtime.open"],
          ["再生中", "runtime.nowPlaying"],
          ["歌詞を読み込んでいます。", "runtime.lyricsLoading"],
          ["この曲の歌詞はまだありません。", "runtime.lyricsMissing"],
          ["歌詞を読み込めませんでした。", "runtime.lyricsUnavailable"],
          ["悪魔に遭遇", "runtime.devilEncounter"],
          ["悪魔を呼ぶ", "runtime.summonDevil"],
          ["悪魔の案内", "runtime.devilGuide"],
          ["中止", "runtime.cancel"],
          ["創造主は、ASS MAGICという謎の音楽ユニットだ。\nそれ以上のことはわからない。\n\n本人たちさえ、一体何を作っているのかよくわかっていない。", "runtime.creatorCopy"],
          ["どこへ行きたい？", "runtime.whereTo"],
          ["何が望みだ？", "runtime.whatDoYouWant"],
          ["自由に探索したい", "runtime.explore"],
          ["ヒントがほしい", "runtime.needHint"],
          ["案内してほしい", "runtime.needGuide"],
          ["創造主について", "runtime.aboutCreator"],
          ["戻る", "runtime.back"],
          ["わかった", "runtime.gotIt"],
          ["へぇ", "runtime.oh"],
        ]);
        const roots = [
          document.querySelector("#book-status"),
          document.querySelector("#experience-overlay"),
          document.querySelector("#experience-lyrics"),
          document.querySelector("#black-box-overlay"),
          document.querySelector("#devil-guide-overlay"),
          document.querySelector("#devil-guide-summon"),
          document.querySelector("#devil-guide-navigation"),
          document.querySelector("#music-selector-overlay"),
        ].filter(Boolean);
        for (const root of roots) {
          const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
          const nodes = [];
          while (walker.nextNode()) nodes.push(walker.currentNode);
          for (const node of nodes) {
            const key = runtimeKeys.get(node.nodeValue);
            if (key) node.nodeValue = text(key, node.nodeValue);
          }
        }
      }, 0);
    }, { passive: true });
  }

  function initialize() {
    installAnalytics();
    updateDocumentMetadata();
    applyTranslations();
    installLanguageControls();
    installBookSubmitGuard();
    installRuntimeTranslationRefresh();
    track("page_view");
    window.addEventListener("assmagic:experience-mode-selected", (event) => {
      const mode = event.detail?.mode;
      if (mode === "main") track("mode_main_selected");
      if (mode === "chill") track("mode_chill_selected");
      if (mode === "main" || mode === "chill") track("game_started");
    });
  }

  window.assI18n = Object.freeze({
    getLanguage: () => language,
    setLanguage,
    text,
    apply: applyTranslations,
  });

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => safely(initialize), { once: true });
  } else {
    safely(initialize);
  }
})();
