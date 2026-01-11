import axios from "axios";

export async function searchMDN(query) {
  try {
    const url = `https://developer.mozilla.org/api/v1/search?q=${encodeURIComponent(query)}&locale=en-US`;
    const { data } = await axios.get(url);
    if (data.documents) {
      return data.documents.slice(0, 3).map(doc => ({
        title: doc.title,
        mdn_url: doc.mdn_url,
        summary: doc.summary || "No summary available"
      }));
    }
    return [];
  } catch (err) {
    console.error("MDN error:", err.message);
    return [];
  }
}
