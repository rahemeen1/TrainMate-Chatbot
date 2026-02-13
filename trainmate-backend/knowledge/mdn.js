import axios from "axios";

export async function searchMDN(query) {
  try {
    // MDN search API - using correct endpoint
    const url = `https://developer.mozilla.org/api/v1/search`;
    const { data } = await axios.get(url, {
      params: {
        q: query,
        locale: 'en-US'
      },
      timeout: 5000
    });
    
    if (data.documents && Array.isArray(data.documents)) {
      return data.documents.slice(0, 3).map(doc => ({
        title: doc.title,
        mdn_url: doc.mdn_url,
        summary: doc.summary || "No summary available"
      }));
    }
    return [];
  } catch (err) {
    // Silently fail - MDN is optional knowledge source
    if (err.code !== 'ECONNABORTED') {
      console.log("[MDN] Search unavailable, continuing without MDN results");
    }
    return [];
  }
}
