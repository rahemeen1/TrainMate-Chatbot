import axios from "axios";

export async function searchDevTo(query) {
  try {
    // Dev.to search - extract main keyword from query
    const keyword = query.split(' ').find(word => word.length > 3) || query.split(' ')[0];
    const url = `https://dev.to/api/articles`;
    
    const { data } = await axios.get(url, {
      params: {
        per_page: 3,
        tag: keyword.toLowerCase().replace(/[^a-z0-9]/g, '')
      },
      timeout: 5000
    });
    
    if (Array.isArray(data) && data.length > 0) {
      return data.map(item => ({
        title: item.title,
        link: item.url
      }));
    }
    return [];
  } catch (err) {
    // Silently fail - Dev.to is optional knowledge source
    if (err.code !== 'ECONNABORTED') {
      console.log("[Dev.to] Search unavailable, continuing without Dev.to results");
    }
    return [];
  }
}
