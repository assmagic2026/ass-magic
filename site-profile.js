(() => {
  "use strict";

  const NEUTRAL_HOST = "flying.pages.dev";
  const OFFICIAL_ASSET_ROOT = "https://assmagic2026.github.io/ass-magic/";
  const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);
  const NEUTRAL_EXTERNAL_ASSET_PATHS = new Set([
    "/list/nakimushi/track-15.wav",
    "/list/nyahara/track-16.wav",
  ]);
  const NEUTRAL_METADATA = Object.freeze({
    ja: Object.freeze({
      title: "惑星を飛行するブラウザ体験",
      description: "ブラウザで3Dの惑星を飛行し、音楽やさまざまな出来事を体験できます。",
      siteName: "ブラウザ飛行体験",
      locale: "ja_JP",
    }),
    en: Object.freeze({
      title: "Browser Flight Experience",
      description: "Fly across a 3D planet, listen to music, and discover events in your browser.",
      siteName: "Browser Flight Experience",
      locale: "en_US",
    }),
  });

  function resolveSiteProfile(hostname = "", search = "") {
    const normalizedHost = String(hostname).trim().toLowerCase();
    const isNeutralProduction = normalizedHost === NEUTRAL_HOST
      || normalizedHost.endsWith(`.${NEUTRAL_HOST}`);
    let isLocalNeutralPreview = false;
    if (LOCAL_HOSTS.has(normalizedHost)) {
      try {
        const params = new URLSearchParams(String(search));
        isLocalNeutralPreview = params.get("site") === "neutral";
      } catch (error) {
        isLocalNeutralPreview = false;
      }
    }
    const neutral = isNeutralProduction || isLocalNeutralPreview;
    const resolveAssetUrl = (resolvedUrl) => {
      if (!neutral) return resolvedUrl;
      try {
        const url = new URL(resolvedUrl);
        if (!NEUTRAL_EXTERNAL_ASSET_PATHS.has(url.pathname)) return url.href;
        return new URL(url.pathname.slice(1), OFFICIAL_ASSET_ROOT).href;
      } catch (error) {
        return resolvedUrl;
      }
    };
    return Object.freeze({
      id: neutral ? "neutral" : "official",
      neutral,
      official: !neutral,
      showCreatorStory: !neutral,
      hostname: normalizedHost,
      metadata: neutral ? NEUTRAL_METADATA : null,
      neutralUrl: `https://${NEUTRAL_HOST}/`,
      resolveAssetUrl,
    });
  }

  const currentLocation = typeof location === "object" && location
    ? location
    : { hostname: "", search: "" };
  const profile = resolveSiteProfile(currentLocation.hostname, currentLocation.search);

  globalThis.assResolveSiteProfile = resolveSiteProfile;
  globalThis.assSiteProfile = profile;

  if (typeof document !== "object" || !document?.documentElement) return;

  document.documentElement.dataset.siteProfile = profile.id;

  function setMeta(selector, value) {
    const element = document.head?.querySelector(selector);
    if (element) element.setAttribute("content", value);
  }

  function getLanguage() {
    try {
      const language = globalThis.assI18n?.getLanguage?.();
      if (language === "en" || language === "ja") return language;
    } catch (error) {
      // Fall back to the document language without interrupting the experience.
    }
    return document.documentElement.lang === "en" ? "en" : "ja";
  }

  function applyNeutralProfile() {
    if (!profile.neutral) return;
    const language = getLanguage();
    const metadata = profile.metadata[language] || profile.metadata.ja;
    document.title = metadata.title;
    setMeta('meta[name="description"]', metadata.description);
    setMeta('meta[property="og:site_name"]', metadata.siteName);
    setMeta('meta[property="og:title"]', metadata.title);
    setMeta('meta[property="og:description"]', metadata.description);
    setMeta('meta[property="og:url"]', profile.neutralUrl);
    setMeta('meta[property="og:locale"]', metadata.locale);
    setMeta('meta[name="twitter:title"]', metadata.title);
    setMeta('meta[name="twitter:description"]', metadata.description);
    document.head?.querySelector('link[rel="canonical"]')?.remove();

    for (const element of document.querySelectorAll("[data-neutral-hide]")) {
      element.setAttribute("aria-hidden", "true");
    }
    for (const element of document.querySelectorAll("[data-neutral-text-ja]")) {
      const value = language === "en"
        ? element.dataset.neutralTextEn
        : element.dataset.neutralTextJa;
      if (typeof value === "string") element.textContent = value;
    }

    const hiddenActiveButton = document.querySelector(".menu-nav-btn.is-active[data-neutral-hide]");
    if (hiddenActiveButton) {
      hiddenActiveButton.classList.remove("is-active");
      document.querySelector('.menu-nav-btn[data-page="game"]')?.classList.add("is-active");
      document.querySelector('.menu-page.is-active[data-neutral-hide]')?.classList.remove("is-active");
      document.querySelector('.menu-page[data-page="game"]')?.classList.add("is-active");
    }
  }

  globalThis.assApplySiteProfile = applyNeutralProfile;
  globalThis.addEventListener("assmagic:locale-changed", applyNeutralProfile);
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", applyNeutralProfile, { once: true });
  } else {
    applyNeutralProfile();
  }
})();
