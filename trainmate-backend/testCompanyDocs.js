// testCompanyDocs.js
import dotenv from "dotenv";
dotenv.config();

import { fetchCompanyDocs } from "./services/companyDocs.js";
import { searchStackOverflow } from "./knowledge/stackoverflow.js";
import { searchMDN } from "./knowledge/mdn.js";
import { searchDevTo } from "./knowledge/devto.js";

const testQuery = async () => {
  try {
    const userQuery = "MERN"; // Your test query
    const userContext = {
      companyId: "5gM3LinBndZ54SYJuYTRiT8H1p82",
      deptName: "SOFTWAREDEVELOPMENT"
    };

    // 1️⃣ Fetch company docs
    const companyDocs = await fetchCompanyDocs(userQuery, userContext);

    // 2️⃣ Fetch external knowledge
    const mdnResults = await searchMDN(userQuery);
    const soResults = await searchStackOverflow(userQuery);
    const devtoResults = await searchDevTo(userQuery);

    // 3️⃣ Assign confidence
    const companyDocsWithConfidence = companyDocs.map((doc, i) => ({
      ...doc,
      source: "companyDocs",
      confidence: 0.5 - i * 0.01 // highest confidence for top company doc
    }));

    const mdnWithConfidence = mdnResults.map(doc => ({
      ...doc,
      source: "mdn",
      confidence: 0.2
    }));

    const soWithConfidence = soResults.map(doc => ({
      ...doc,
      source: "stackOverflow",
      confidence: 0.15
    }));

    const devtoWithConfidence = devtoResults.map(doc => ({
      ...doc,
      source: "devto",
      confidence: 0.1
    }));

    // 4️⃣ Aggregate and sort by confidence
    const aggregated = [
      ...companyDocsWithConfidence,
      ...mdnWithConfidence,
      ...soWithConfidence,
      ...devtoWithConfidence
    ].sort((a, b) => b.confidence - a.confidence);

    // 5️⃣ Log top answer
    console.log("\n=== TOP ANSWER ===");
    console.log(`Source: ${aggregated[0].source}`);
    console.log(`Confidence: ${aggregated[0].confidence.toFixed(2)}`);
    console.log(aggregated[0].text || aggregated[0].title);

    // 6️⃣ Log all results
    console.log("\n=== ALL RESULTS ===");
    aggregated.forEach((r, i) => {
      console.log(`${i + 1}. [${r.source}] Confidence: ${r.confidence.toFixed(2)}`);
      console.log(r.text || r.title);
      if (r.link || r.mdn_url) console.log("Link:", r.link || r.mdn_url);
      console.log("---");
    });
  } catch (err) {
    console.error("Error in testQuery:", err);
  }
};

testQuery();
