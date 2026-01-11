import axios from "axios";

export async function searchDevTo(query) {
  try {
    const url = `https://dev.to/api/articles?per_page=3&tag=${encodeURIComponent(query)}`;
    const { data } = await axios.get(url);
    if (Array.isArray(data)) {
      return data.map(item => ({
        title: item.title,
        link: item.url
      }));
    }
    return [];
  } catch (err) {
    console.error("Dev.to error:", err.message);
    return [];
  }
}
