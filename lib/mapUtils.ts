export function isGoogleMapsUrl(url: string): boolean {
  if (!url) return false;
  return url.includes('google.com/maps') || url.includes('maps.app.goo') || url.includes('goo.gl/maps');
}

export function isNaverMapUrl(url: string): boolean {
  if (!url) return false;
  return url.includes('naver.com') || url.includes('naver.me');
}

export function isKakaoMapUrl(url: string): boolean {
  if (!url) return false;
  return url.includes('map.kakao.com') || url.includes('place.map.kakao.com') || url.includes('kko.to');
}

export function extractPlaceFromKakaoUrl(url: string): string | null {
  if (!url) return null;
  // https://map.kakao.com/link/search/PLACE_NAME
  const linkSearchMatch = url.match(/\/link\/search\/([^?&#]+)/);
  if (linkSearchMatch) return decodeURIComponent(linkSearchMatch[1].replace(/\+/g, ' '));
  // https://map.kakao.com/?q=PLACE_NAME
  const qMatch = url.match(/[?&]q=([^&#]+)/);
  if (qMatch) return decodeURIComponent(qMatch[1].replace(/\+/g, ' '));
  return null;
}

export function extractUrl(text: string): string | null {
  if (!text) return null;
  const match = text.match(/(https?:\/\/[^\s]+)/);
  return match ? match[1] : null;
}

export function parseGoogleMapsUrl(url: string): { placeName: string; searchQuery: string } | null {
  if (!url) return null;
  if (!isGoogleMapsUrl(url)) return null;

  // 解析 /place/地點名稱/
  const placeMatch = url.match(/\/place\/([^/@?]+)/);
  if (placeMatch) {
    const name = decodeURIComponent(placeMatch[1].replace(/\+/g, ' '));
    return { placeName: name, searchQuery: name };
  }
  // 解析 ?q= 參數
  const qMatch = url.match(/[?&]q=([^&]+)/);
  if (qMatch) {
    const name = decodeURIComponent(qMatch[1].replace(/\+/g, ' '));
    return { placeName: name, searchQuery: name };
  }
  return { placeName: url, searchQuery: url };
}

export function extractCoordsFromUrl(url: string): { latitude: number; longitude: number } | null {
  if (!url) return null;

  // 格式 1: @lat,lng
  const atMatch = url.match(/@(-?\d+\.\d+),(-?\d+\.\d+)/);
  if (atMatch) {
    return { latitude: parseFloat(atMatch[1]), longitude: parseFloat(atMatch[2]) };
  }

  // 格式 2: q=lat,lng 或 query=lat,lng
  const qMatch = url.match(/[?&](?:q|query)=(-?\d+\.\d+),(-?\d+\.\d+)/);
  if (qMatch) {
    return { latitude: parseFloat(qMatch[1]), longitude: parseFloat(qMatch[2]) };
  }

  // 格式 3: /maps/search/lat,lng 或 /maps/place/lat,lng
  const pathMatch = url.match(/\/maps\/(?:search|place)\/(-?\d+\.\d+),(-?\d+\.\d+)/);
  if (pathMatch) {
    return { latitude: parseFloat(pathMatch[1]), longitude: parseFloat(pathMatch[2]) };
  }

  // 格式 4: 網址中任何符合 lat,lng 格式的數字對（範圍校驗防呆）
  const generalMatch = url.match(/(-?\d+\.\d+),(-?\d+\.\d+)/);
  if (generalMatch) {
    const lat = parseFloat(generalMatch[1]);
    const lng = parseFloat(generalMatch[2]);
    if (lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180) {
      return { latitude: lat, longitude: lng };
    }
  }

  return null;
}

export function getMapQuery(item: { location?: string; location_url?: string; title: string }): string {
  const place = item.location || '';
  const url = item.location_url || '';

  // 1. 優先從 location_url 或 location 提取經緯度
  const coords = extractCoordsFromUrl(url) || extractCoordsFromUrl(place);
  if (coords) {
    return `${coords.latitude},${coords.longitude}`;
  }

  // 2. 若 location 是 Kakao 地圖網址，提取地名
  if (isKakaoMapUrl(place)) {
    const name = extractPlaceFromKakaoUrl(place);
    return name || item.title;
  }

  // 3. 若 location_url 是 Kakao 地圖網址，提取地名
  if (isKakaoMapUrl(url)) {
    const name = extractPlaceFromKakaoUrl(url);
    return name || item.title;
  }

  // 4. 若 location 是 Google 地圖網址，嘗試解析出地名
  if (isGoogleMapsUrl(place)) {
    const parsed = parseGoogleMapsUrl(place);
    if (parsed && parsed.placeName && !isGoogleMapsUrl(parsed.placeName)) {
      return parsed.placeName;
    }
  }

  // 5. 若 location_url 是 Google 地圖網址，嘗試解析出地名
  if (isGoogleMapsUrl(url)) {
    const parsed = parseGoogleMapsUrl(url);
    if (parsed && parsed.placeName && !isGoogleMapsUrl(parsed.placeName)) {
      return parsed.placeName;
    }
  }

  // 6. 退路：直接使用 location 字串或行程標題
  return place || item.title;
}
