import axios from "axios";

export async function searchStackOverflow(query) {
  try {
    const url = `https://api.stackexchange.com/2.3/search/advanced?order=desc&sort=relevance&q=${encodeURIComponent(query)}&site=stackoverflow&pagesize=3`;
    const { data } = await axios.get(url);
    if (data.items) {
      return data.items.map(item => ({
        title: item.title,
        link: item.link
      }));
    }
    return [];
  } catch (err) {
    console.error("StackOverflow error:", err.message);
    return [];
  }
}
