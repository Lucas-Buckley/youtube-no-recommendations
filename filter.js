(() => {
  "use strict";

  const pageAttribute = "data-ytnr-page";
  const linkAttribute = "data-ytnr-link";
  const linkSelector = "a, area";
  const youtubeHost = /^(?:(?:www|m|music)\.)?youtube\.com$/;
  const channelPath = /^\/(?:@[^/]+|(?:channel|c|user)\/[^/]+)(?:\/|$)/;
  const videoPath = /^\/(?:shorts|live|embed|v)\/[^/]+/;
  let lastBase;
  let lastPath;

  function syncPage() {
    const root = document.documentElement;
    if (!root) return;

    // Relative links can change destinations when YouTube reuses a page.
    const base = document.baseURI;
    const path = location.pathname.replace(/\/+$/, "") || "/";
    if (path !== lastPath || !root.hasAttribute(pageAttribute)) {
      lastPath = path;
      let page = "filtered";
      if (path === "/results" || path === "/feed/subscriptions" || channelPath.test(path)) {
        page = "allowed";
      } else if (path === "/") {
        page = "home";
      } else if (/^\/shorts(?:\/|$)/.test(path)) {
        page = "shorts";
      }
      if (root.getAttribute(pageAttribute) !== page) root.setAttribute(pageAttribute, page);
    }

    if (base !== lastBase) {
      lastBase = base;
      document.querySelectorAll(linkSelector).forEach(updateLink);
    }
  }

  function classifyLink(link) {
    const href = link.getAttribute("href");
    if (!href) return null;

    let destination;
    try {
      destination = new URL(href, document.baseURI);
    } catch {
      return null;
    }

    if (destination.protocol !== "https:" && destination.protocol !== "http:") return null;

    const { hostname, pathname, searchParams } = destination;
    if (hostname === "youtu.be") return pathname.length > 1 ? "video" : null;
    if (!youtubeHost.test(hostname)) return null;

    if (/^\/shorts\/?$/.test(pathname)) return "shorts-feed";
    if (
      videoPath.test(pathname) ||
      (/^\/watch\/?$/.test(pathname) && searchParams.has("v")) ||
      (/^\/attribution_link\/?$/.test(pathname) && /^\/watch\?/.test(searchParams.get("u") || ""))
    ) {
      return "video";
    }
    return null;
  }

  function updateLink(link) {
    const type = classifyLink(link);
    if (type) {
      if (link.getAttribute(linkAttribute) !== type) link.setAttribute(linkAttribute, type);
    } else {
      link.removeAttribute(linkAttribute);
    }
  }

  function scanLinks(node) {
    if (node.nodeType !== Node.ELEMENT_NODE) return;
    if (node.matches(linkSelector)) updateLink(node);
    node.querySelectorAll(linkSelector).forEach(updateLink);
  }

  // The stylesheet handles known card and player markup immediately. Classifying
  // links also catches plain-text links and renderers YouTube may introduce.
  const observer = new MutationObserver((mutations) => {
    syncPage();
    for (const mutation of mutations) {
      if (mutation.type === "attributes") {
        if (mutation.target.matches(linkSelector)) updateLink(mutation.target);
      } else {
        mutation.addedNodes.forEach(scanLinks);
      }
    }
  });

  observer.observe(document, {
    subtree: true,
    childList: true,
    attributes: true,
    attributeFilter: ["href"]
  });

  // YouTube reuses the document across routes, including browser back/forward.
  window.navigation?.addEventListener("currententrychange", syncPage);
  window.addEventListener("popstate", syncPage);
  window.addEventListener("pageshow", syncPage);
  document.addEventListener("yt-navigate-finish", syncPage);

  syncPage();
})();
