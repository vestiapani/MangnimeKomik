const BE = "https://be.komikcast.cc";

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function getRandomIP() {
  return `${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}`;
}

async function fetchAPI(path: string): Promise<any> {
  await delay(1000);

  const fakeIP = getRandomIP();

  const res = await fetch(`${BE}${path}`, {
    headers: {
      Origin: "https://v2.komikcast.fit",
      Referer: "https://v2.komikcast.fit/",
      Accept: "application/json, text/plain, */*",
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
      "X-Forwarded-For": fakeIP,
      "X-Real-IP": fakeIP,
    },
  });

  if (!res.ok) throw new Error(`HTTP ${res.status} — ${path}`);
  return await res.json();
}

// ✅ FIX: Fungsi normalizeCard dikembalikan seperti versi Deno yang tahan banting
const normalizeCard = (item: any) => {
  const d = item.data?.title ? item.data : item.data?.data || item.data || item;

  let chapterText = "";
  if (d.chapters && d.chapters.length > 0) {
    const firstCh = d.chapters[0].data || d.chapters[0];
    chapterText = `Ch ${firstCh.slug || firstCh.index || ""}`;
  } else if (d.totalChapters) {
    chapterText = `Ch ${d.totalChapters}`;
  }

  return {
    title: d.title || d.nativeTitle || "",
    slug: d.slug || "",
    image: d.coverImage || d.backgroundImage || d.cover || "",
    score: d.rating || "?",
    type: d.format || d.type || "Manga",
    status: d.status || "Ongoing",
    chapter: chapterText,
  };
};

const normalizeDetail = (detailItem: any, chaptersData: any[] = []) => {
  const d = detailItem.data?.title
    ? detailItem.data
    : detailItem.data?.data || detailItem.data || detailItem;

  const mappedGenres = (d.genres || []).map((g: any) => {
    const gData = g.data || g;
    return { id: g.id || gData.name, name: gData.name, slug: gData.name };
  });

  const mappedChapters = (chaptersData || []).map((ch: any) => {
    const chData = ch.data || ch;
    const chapSlug = chData.slug || chData.index;
    return {
      chapterIndex: chapSlug,
      title: chData.title || `Chapter ${chapSlug}`,
      createdAt: ch.createdAt || null,
    };
  });

  return {
    title: d.title || "",
    nativeTitle: d.nativeTitle || "",
    slug: d.slug || "",
    cover: d.coverImage || d.cover || "",
    backgroundImage: d.backgroundImage || d.coverImage || "",
    rating: d.rating || "?",
    status: d.status || "Unknown",
    author: d.author || "Unknown",
    format: d.format || d.type || "Manga",
    totalChapters: d.totalChapters || mappedChapters.length || 0,
    synopsis: d.synopsis || "Sinopsis belum tersedia.",
    genres: mappedGenres,
    readChapter: mappedChapters,
    recommended: (d.recommended || []).map(normalizeCard),
  };
};

const normalizeChapterDetail = (
  item: any,
  seriesSlug: string,
  chapterSlug: string,
  chapters: any[] = [],
) => {
  const d = item.data?.title ? item.data : item.data?.data || item.data || item;
  const chapterIndex = item.data?.chapterIndex ?? Number(chapterSlug);
  const sorted = [...chapters].sort(
    (a, b) => (a.data?.index ?? 0) - (b.data?.index ?? 0),
  );
  const currentPos = sorted.findIndex((ch) => ch.data?.index === chapterIndex);
  const prevChapter = currentPos > 0 ? sorted[currentPos - 1] : null;
  const nextChapter =
    currentPos < sorted.length - 1 ? sorted[currentPos + 1] : null;
  const currentChapter = currentPos >= 0 ? sorted[currentPos] : null;

  return {
    komikTitle: d.title || seriesSlug.replace(/-/g, " "),
    chapterIndex,
    images: d.images || [],
    prevChapterId: prevChapter?.data?.index ?? null,
    nextChapterId: nextChapter?.data?.index ?? null,
    createdAt: currentChapter?.createdAt ?? item.createdAt ?? null,
  };
};

export async function getHomeData() {
  const popularRes = await fetchAPI(
    `/series?preset=popular_all&take=10&page=1`,
  );
  const latestRes = await fetchAPI(
    `/series?preset=rilisan_terbaru&take=15&page=1`,
  );

  return {
    popular: (popularRes?.data || []).map(normalizeCard),
    newest: (latestRes?.data || []).map(normalizeCard),
  };
}

export async function getLatestKomik(page = 1) {
  const data = await fetchAPI(
    `/series?preset=rilisan_terbaru&take=20&page=${page}`,
  );
  return {
    data: (data?.data || []).map(normalizeCard),
    meta: data?.meta || { page, lastPage: 50 },
  };
}

export async function getPopularKomik(page = 1, category = "all") {
  const filter =
    category.toLowerCase() !== "all" ? `&format=${category.toLowerCase()}` : "";
  const data = await fetchAPI(
    `/series?preset=popular_all&take=20&page=${page}${filter}`,
  );
  return {
    data: (data?.data || []).map(normalizeCard),
    meta: data?.meta || { page, lastPage: 50 },
  };
}

export async function searchKomik(
  query: string,
  page = 1,
  genreIds: string = "",
  format: string = "",
) {
  let url = `/series?take=20&page=${page}&includeMeta=true`;
  if (query) {
    url += `&filter=${encodeURIComponent(`title=like="${query}",nativeTitle=like="${query}"`)}`;
  }
  if (genreIds) url += `&genreIds=${genreIds}`;
  if (format && format.toLowerCase() !== "all")
    url += `&format=${format.toLowerCase()}`;
  const data = await fetchAPI(url);
  return {
    data: (data?.data || []).map(normalizeCard),
    meta: data?.meta || { page, lastPage: 50 },
  };
}

export async function getKomikDetail(slug: string) {
  const detailRaw = await fetchAPI(`/series/${slug}?includeMeta=true`).catch(
    () => null,
  );
  const chaptersRaw = await fetchAPI(`/series/${slug}/chapters`).catch(
    () => null,
  );

  return normalizeDetail(detailRaw, chaptersRaw?.data || []);
}

export async function getChapterDetail(
  seriesSlug: string,
  chapterSlug: string,
) {
  const data = await fetchAPI(`/series/${seriesSlug}/chapters/${chapterSlug}`);
  const chaptersRaw = await fetchAPI(`/series/${seriesSlug}/chapters`).catch(
    () => null,
  );

  return normalizeChapterDetail(
    data,
    seriesSlug,
    chapterSlug,
    chaptersRaw?.data || [],
  );
}

export async function getGenreList() {
  const data = await fetchAPI(`/genres`);
  const genresArray = data?.data || data || [];
  return genresArray.map((g: any) => ({
    id: g.id,
    data: {
      name: g.data?.name || g.name,
      description: g.data?.description || g.description,
    },
  }));
}

export async function getKomikByGenre(genreSlug: string, page = 1, take = 12) {
  const data = await fetchAPI(
    `/series?genreIds=${genreSlug}&sort=latest&sortOrder=desc&take=${take}&page=${page}`,
  );
  return {
    data: (data?.data || []).map(normalizeCard),
    meta: data?.meta || { page, lastPage: 50 },
  };
}
