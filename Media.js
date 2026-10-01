/**
 * Media.js
 * GAS doGet() の YouTube以外（TVer + こち星）をブラウザ側へ移したもの。
 * YouTubeプレイリスト由来のカードは YouTube.json の Media を使う。
 *
 * 並び（旧GASと同じ）
 *   1. TVer エピソード
 *   2. 櫻坂46こち星（固定）
 *   3. YouTube.json の Media
 *
 * 注意:
 * TVer API は Access-Control-Allow-Origin: https://tver.jp のみ。
 * konnagi.com からの直fetchはCORSで失敗する。
 * その場合はこち星 + YouTube.json の Media だけ表示する。
 */
(function () {
  "use strict";

  const TVER_API_URL =
    "https://contents-api.tver.jp/contents/api/v1/talents/t05fbe3/episodes?sort_key=streaming_start_at";

  const TVER_IMAGE_PREFIX = "https://image-cdn.tver.jp/w=800,dpr=2";

  const KOCHIHOSHI = {
    title:
      "まだなんの色にも染まっていない櫻坂46が未来に向かって枝葉を伸ばす30分番組「櫻坂46こち星」。週替わりで櫻坂メンバーが登場します。",
    horizontal_thumbnail_path:
      "https://www.allnightnippon.com/wp/assets/uploads/2022/06/371efeeebc04ef1594cb06bcb6f4c935.jpg",
    episodeURL: "https://radiko.jp/r_seasons/10002455"
  };

  const MEDIA_CACHE_KEY = "konnagi_media_cache_v2";
  const MEDIA_CACHE_TIME = "konnagi_media_cache_time_v2";
  const MEDIA_CACHE_TTL = 10 * 60 * 1000;

  function extractVideoId(value) {
    if (!value) return "";
    if (typeof value === "object") {
      value = value.videoId || value.id || value.url || value.href || value.episodeURL || "";
    }
    const text = String(value).trim();
    const matched =
      text.match(/(?:v=|\/embed\/|\/shorts\/|youtu\.be\/)([A-Za-z0-9_-]{11})/) ||
      text.match(/^([A-Za-z0-9_-]{11})$/);
    return matched ? matched[1] : "";
  }

  function createMediaCard(item) {
    if (!item || typeof item !== "object") return null;

    const titleText = item.title || item.name || "";
    const thumbnailURL = item.horizontal_thumbnail_path || item.thumbnail || "";
    const episodeURL = item.episodeURL || item.url || "";
    const videoId = extractVideoId(item.videoId || item.id || episodeURL);

    if (!titleText && !videoId) return null;
    if (!episodeURL && !videoId) return null;

    const card = document.createElement("button");
    card.type = "button";
    card.className = "youtube-card";

    if (videoId && (!episodeURL || /youtu\.?be|youtube\.com/.test(episodeURL))) {
      card.dataset.videoId = videoId;
    } else if (episodeURL) {
      card.dataset.mediaUrl = episodeURL;
    }

    const thumbnail = document.createElement("div");
    thumbnail.className = "youtube-thumbnail";

    const image = document.createElement("img");
    image.alt = titleText || "メディア";
    image.width = 1280;
    image.height = 720;
    image.loading = "lazy";
    image.decoding = "async";

    if (thumbnailURL) {
      image.src = thumbnailURL;
    } else if (videoId) {
      image.src = "https://i.ytimg.com/vi/" + videoId + "/maxresdefault.jpg";
    }

    image.onerror = function () {
      if (videoId && image.dataset.fallback !== "true") {
        image.dataset.fallback = "true";
        image.src = "https://i.ytimg.com/vi/" + videoId + "/hqdefault.jpg";
        return;
      }
      image.style.display = "none";
      thumbnail.classList.add("thumbnail-error");
    };

    thumbnail.appendChild(image);

    const info = document.createElement("div");
    info.className = "youtube-info";

    const title = document.createElement("div");
    title.className = "youtube-name";
    title.textContent = titleText || "YouTube";
    info.appendChild(title);

    card.appendChild(thumbnail);
    card.appendChild(info);

    if (!titleText && videoId) {
      fetch(
        "https://www.youtube.com/oembed?url=" +
          encodeURIComponent("https://www.youtube.com/watch?v=" + videoId) +
          "&format=json"
      )
        .then(function (response) {
          if (!response.ok) throw new Error("oEmbed error");
          return response.json();
        })
        .then(function (data) {
          if (data && data.title) title.textContent = data.title;
        })
        .catch(function () {
          title.textContent = "YouTube動画";
        });
    }

    return card;
  }

  function renderMediaData(items) {
    const container = document.getElementById("mediaGrid");
    if (!container) return;

    container.innerHTML = "";

    if (!Array.isArray(items) || !items.length) {
      const empty = document.createElement("div");
      empty.className = "youtube-error";
      empty.textContent = "メディア情報がありません。";
      container.appendChild(empty);
      return;
    }

    const fragment = document.createDocumentFragment();
    items.forEach(function (item) {
      const card = createMediaCard(item);
      if (card) fragment.appendChild(card);
    });

    if (!fragment.childNodes.length) {
      const errorElement = document.createElement("div");
      errorElement.className = "youtube-error";
      errorElement.textContent = "表示できるメディアがありません。";
      container.appendChild(errorElement);
      return;
    }

    container.appendChild(fragment);
  }

  function showMediaMessage(className, text) {
    const container = document.getElementById("mediaGrid");
    if (!container) return;
    container.innerHTML = "";
    const el = document.createElement("div");
    el.className = className;
    el.textContent = text;
    container.appendChild(el);
  }

  function getMediaCache() {
    try {
      const raw = localStorage.getItem(MEDIA_CACHE_KEY);
      if (!raw) return null;
      const items = JSON.parse(raw);
      return Array.isArray(items) ? items : null;
    } catch (error) {
      console.warn("Mediaキャッシュ読み込み失敗:", error);
      return null;
    }
  }

  function saveMediaCache(items) {
    try {
      localStorage.setItem(MEDIA_CACHE_KEY, JSON.stringify(items));
      localStorage.setItem(MEDIA_CACHE_TIME, String(Date.now()));
    } catch (error) {
      console.warn("Mediaキャッシュ保存失敗:", error);
    }
  }

  function isMediaCacheFresh() {
    try {
      const time = Number(localStorage.getItem(MEDIA_CACHE_TIME));
      if (!time) return false;
      return Date.now() - time < MEDIA_CACHE_TTL;
    } catch (error) {
      return false;
    }
  }

  function mapTverEpisodes(json) {
    if (!json || !Array.isArray(json.episodes)) return [];
    return json.episodes.map(function (episode) {
      return {
        title: episode.title || "",
        horizontal_thumbnail_path:
          TVER_IMAGE_PREFIX + (episode.horizontal_thumbnail_path || ""),
        episodeURL: "https://tver.jp/episodes/" + episode.id
      };
    }).filter(function (item) {
      return item.title && item.episodeURL;
    });
  }

  async function fetchTverEpisodes() {
    const response = await fetch(TVER_API_URL, {
      method: "GET",
      cache: "default",
      headers: {
        accept: "*/*",
        "x-tver-platform-type": "web"
      }
    });

    if (!response.ok) {
      throw new Error("TVer HTTP " + response.status);
    }

    const json = await response.json();
    if (json && json.error) {
      throw new Error(json.message || "TVer API error");
    }
    return mapTverEpisodes(json);
  }

  function normalizeYouTubeMedia(data) {
    if (!data) return [];

    let list = [];
    if (Array.isArray(data.Media)) list = data.Media;
    else if (data.YouTube && Array.isArray(data.YouTube.Media)) list = data.YouTube.Media;
    else {
      const key = Object.keys(data).find(function (k) {
        return k.toLowerCase() === "media";
      });
      if (key && Array.isArray(data[key])) list = data[key];
    }

    return list.map(function (item) {
      if (typeof item === "string") {
        const videoId = extractVideoId(item);
        if (!videoId) return null;
        return {
          title: "",
          horizontal_thumbnail_path:
            "https://i.ytimg.com/vi/" + videoId + "/maxresdefault.jpg",
          episodeURL: "https://www.youtube.com/watch?v=" + videoId,
          videoId: videoId
        };
      }
      if (!item || typeof item !== "object") return null;
      const videoId = extractVideoId(item.videoId || item.id || item.episodeURL || item.url);
      return {
        title: item.title || item.name || "",
        horizontal_thumbnail_path:
          item.horizontal_thumbnail_path ||
          item.thumbnail ||
          (videoId ? "https://i.ytimg.com/vi/" + videoId + "/maxresdefault.jpg" : ""),
        episodeURL:
          item.episodeURL ||
          item.url ||
          (videoId ? "https://www.youtube.com/watch?v=" + videoId : ""),
        videoId: videoId
      };
    }).filter(Boolean);
  }

  async function loadYouTubeMedia() {
    const response = await fetch("./YouTube.json", { cache: "no-cache" });
    if (!response.ok) {
      throw new Error("YouTube.json HTTP " + response.status);
    }
    const data = await response.json();
    return normalizeYouTubeMedia(data);
  }

  async function buildMediaItems() {
    const youtubeMedia = await loadYouTubeMedia().catch(function (error) {
      console.error("YouTube.json の Media 読み込みに失敗しました:", error);
      return [];
    });

    let tverItems = [];
    try {
      tverItems = await fetchTverEpisodes();
    } catch (error) {
      console.error("TVer APIの読み込みに失敗しました:", error);
    }

    return tverItems.concat([KOCHIHOSHI], youtubeMedia);
  }

  async function loadMediaData(forceRefresh) {
    const container = document.getElementById("mediaGrid");
    if (!container) return;

    const cachedItems = getMediaCache();
    if (cachedItems && cachedItems.length) {
      renderMediaData(cachedItems);
      if (!forceRefresh && isMediaCacheFresh()) return;
    } else {
      showMediaMessage("youtube-loading", "読み込み中…");
    }

    try {
      const items = await buildMediaItems();
      if (!items.length) {
        if (cachedItems && cachedItems.length) {
          renderMediaData(cachedItems);
          return;
        }
        showMediaMessage("youtube-error", "メディア情報がありません。");
        return;
      }
      saveMediaCache(items);
      renderMediaData(items);
    } catch (error) {
      console.error("Mediaの読み込みに失敗しました:", error);
      if (cachedItems && cachedItems.length) {
        renderMediaData(cachedItems);
        return;
      }
      showMediaMessage("youtube-error", "メディア情報を読み込めませんでした。");
    }
  }

  window.loadMediaData = loadMediaData;

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", function () {
      loadMediaData();
    });
  } else {
    loadMediaData();
  }
})();
