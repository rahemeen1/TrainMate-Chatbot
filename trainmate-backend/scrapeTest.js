import axios from "axios";

// ==============================
// StackOverflow Search
// ==============================
async function searchStackOverflow(query) {
  try {
    const url = `https://api.stackexchange.com/2.3/search/advanced?order=desc&sort=relevance&q=${encodeURIComponent(
      query
    )}&site=stackoverflow&pagesize=3`;

    const { data } = await axios.get(url);

    console.log("=== StackOverflow Results ===");
    if (data.items && data.items.length > 0) {
      data.items.forEach((item, idx) => {
        console.log(`${idx + 1}. ${item.title}`);
        console.log(`   Link: ${item.link}`);
      });
    } else {
      console.log("No StackOverflow results found.");
    }
  } catch (err) {
    console.error("StackOverflow error:", err.message);
  }
}
// ==============================
// MDN Search
// ==============================
async function searchMDN(query) {
  try {
    const url = `https://developer.mozilla.org/api/v1/search?q=${encodeURIComponent(query)}&locale=en-US`;
    const { data } = await axios.get(url);

    console.log("\n=== MDN Search Results ===");
    if (data.documents && data.documents.length > 0) {
      data.documents.slice(0, 3).forEach((doc, idx) => {
        console.log(`${idx + 1}. ${doc.title}`);
        console.log("   MDN URL:", doc.mdn_url);
        console.log("   Excerpt:", doc.summary?.slice(0, 150) || "No summary available", "...");
      });
    } else {
      console.log("No MDN results found.");
    }
  } catch (err) {
    console.error("MDN error:", err.message);
  }
}
// ==============================
// Dev.to Search
// ==============================
async function searchDevTo(query) {
  try {
    const url = `https://dev.to/api/articles?per_page=3&tag=${encodeURIComponent(
      query.split(" ")[0].toLowerCase()
    )}`;

    const { data } = await axios.get(url);

    console.log("\n=== Dev.to Articles ===");
    if (Array.isArray(data) && data.length > 0) {
      data.forEach((article, idx) => {
        console.log(`${idx + 1}. ${article.title}`);
        console.log(`   Link: ${article.url}`);
        console.log(
          "   Description:",
          article.description || "No description available"
        );
      });
    } else {
      console.log("No Dev.to articles found.");
    }
  } catch (err) {
    console.error("Dev.to error:", err.message);
  }
}



// ==============================
// Test all sources
// ==============================
async function testScrape() {
  const query = "JavaScript closures"; // Example query
  await searchStackOverflow(query);
  await searchMDN(query);
  await searchDevTo(query);
}

testScrape();
