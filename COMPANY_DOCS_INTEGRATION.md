# 🎯 Company Documentation Integration with Weak Areas

## Overview
Enhanced roadmap regeneration system that creates modules focusing on **BOTH** quiz weak areas **AND** company-specific implementations from documentation.

---

## 🔄 How It Works

### 1. **Dual-Source Data Collection**

**Before (Old System):**
```
User fails quiz → Identify weak concepts → Fetch general company docs → Generate roadmap
```

**Now (Enhanced System):**
```
User fails quiz 
  → Identify weak concepts (e.g., "async/await", "useEffect")
  → Fetch TWO sets of company docs:
      1. General company docs (baseline)
      2. Weakness-specific docs (targeted queries for each weak concept)
  → Extract company skills related to weak concepts
  → Generate roadmap combining both
```

### 2. **Targeted Document Retrieval**

**Example Flow:**
```javascript
// Weak concepts identified: ["async/await", "useEffect", "promises"]

// System creates targeted queries:
1. "async/await React implementation best practices examples"
2. "useEffect React implementation best practices examples"  
3. "promises React implementation best practices examples"

// Fetches company docs for each query
// Result: 15 base docs + 12 weakness-specific docs = 27 total docs
```

### 3. **Company Skills Extraction**

**Intelligent Skill Matching:**
```javascript
// Company docs contain: ["React Hooks", "async data fetching", "useEffect lifecycle", ...]
// Weak concepts: ["useEffect", "async"]

// System extracts weakness-related skills:
weaknessRelatedGap = ["useEffect lifecycle", "async data fetching", "custom hooks"]

// These are PRIORITIZED in module generation
```

---

## 📊 Data Flow Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                    USER FAILS QUIZ (Score 62%)                  │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             ▼
        ┌────────────────────────────────────────┐
        │   WEAKNESS ANALYSIS SYSTEM             │
        │   • Wrong questions: 18                │
        │   • Weak concepts: async(5), useEffect(4), promises(3) │
        └────────────────┬───────────────────────┘
                         │
         ┌───────────────┴───────────────┐
         │                               │
         ▼                               ▼
┌─────────────────────┐      ┌─────────────────────┐
│  FETCH BASE DOCS    │      │ FETCH WEAK CONCEPT  │
│  • General company  │      │ SPECIFIC DOCS       │
│    training docs    │      │ • "async React"     │
│  • Department docs  │      │ • "useEffect best"  │
│  Result: 15 docs    │      │ • "promises impl"   │
└──────────┬──────────┘      │ Result: 12 docs     │
           │                 └──────────┬──────────┘
           │                            │
           └────────────┬───────────────┘
                        ▼
        ┌───────────────────────────────────┐
        │   EXTRACT COMPANY SKILLS          │
        │   • All: 45 skills                │
        │   • Weakness-related: 12 skills   │
        │   [useEffect hooks, async fetch,  │
        │    error handling, state mgmt]    │
        └────────────┬──────────────────────┘
                     │
                     ▼
        ┌────────────────────────────────────┐
        │   AI ROADMAP GENERATION            │
        │   Input context:                   │
        │   • Weak concepts                  │
        │   • Company docs (27 total)        │
        │   • Weakness-related skills (12)   │
        │   • Plan focus areas               │
        └────────────┬───────────────────────┘
                     │
                     ▼
        ┌────────────────────────────────────┐
        │   GENERATED MODULES                │
        │   ✓ "Mastering Async in React"     │
        │     - Uses company code examples   │
        │     - Covers useEffect patterns    │
        │     - Skills: [async, useEffect,   │
        │       error handling, cleanup]     │
        │                                    │
        │   ✓ "Hook Lifecycle Deep Dive"     │
        │     - Company-specific patterns    │
        │     - Skills: [useEffect, custom   │
        │       hooks, dependencies]         │
        └────────────────────────────────────┘
```

---

## 🎓 Example Comparison

### Scenario: User fails quiz on React concepts

**User Weak Concepts:** `async/await`, `useEffect`, `promises`  
**Company Stack:** React, Node.js, Express, MongoDB

### OLD SYSTEM:
```json
{
  "modules": [
    {
      "moduleTitle": "React Fundamentals Review",
      "description": "Review basic React concepts including hooks and state management",
      "estimatedDays": 7,
      "skillsCovered": ["React", "Hooks", "State", "Props"]
    }
  ]
}
```
❌ **Problem:** Too generic, doesn't target weak concepts, no company context

---

### NEW SYSTEM:
```json
{
  "modules": [
    {
      "moduleTitle": "Mastering Async Operations in React Applications",
      "description": "Deep dive into async/await patterns, promise handling, and useEffect for data fetching using company's API architecture. Covers error handling, loading states, and cleanup functions as used in company projects.",
      "estimatedDays": 5,
      "skillsCovered": [
        "async/await in React",
        "useEffect data fetching",
        "Promise error handling",
        "API integration patterns",
        "React cleanup functions"
      ]
    },
    {
      "moduleTitle": "Hook Lifecycle and Side Effects Management",
      "description": "Master useEffect dependency arrays, custom hooks for data fetching, and side effect patterns. Learn company-specific hook patterns and reusable abstractions.",
      "estimatedDays": 4,
      "skillsCovered": [
        "useEffect lifecycle",
        "dependency arrays",
        "custom hooks",
        "side effect patterns",
        "hook composition"
      ]
    }
  ]
}
```
✅ **Benefits:** 
- Directly targets weak concepts (async, useEffect, promises)
- Uses company-specific examples and patterns
- Skills covered match both weaknesses AND company docs
- Module descriptions reference company tech stack

---

## 🔧 Implementation Details

### Enhanced Plan Generation
```javascript
// OLD
generateRoadmapPlan({
  trainingOn: "React",
  cvText,
  skillGap: generalSkillGap
})

// NEW
generateRoadmapPlan({
  trainingOn: "React",
  cvText,
  skillGap: [
    ...weaknessRelatedGap,  // PRIORITY: Skills from company docs related to weak concepts
    ...generalSkillGap      // Other company skills
  ],
  learningProfile: {
    weakConcepts: ["async", "useEffect"],
    companySkillsForWeakness: ["async data fetching", "useEffect lifecycle"],
    regenerationContext: "User failed async and hook questions 5+ times"
  }
})
```

### Enhanced Document Fetching
```javascript
// Fetch general company docs
const baseDocs = await retrieveDocs({ queryText: cvText });

// Fetch weakness-specific company docs
const weaknessDocs = [];
for (const weakConcept of ["async", "useEffect", "promises"]) {
  const docs = await retrieveDocs({ 
    queryText: `${weakConcept} React implementation best practices examples`
  });
  weaknessDocs.push(...docs);
}

// Merge: base + weakness-specific + planned
const allDocs = mergeDocs([...baseDocs, ...weaknessDocs, ...plannedDocs]);
```

### Enhanced AI Prompt
```
🔄 REGENERATION MODE - CRITICAL PRIORITY:

1. Focus on Weak Concepts: async, useEffect, promises
2. Use Company Documentation: Incorporate company code examples
3. Practical Application: Show async patterns in company's React apps
4. Bridge Theory & Practice: 
   - Teach async fundamentals
   - Show company-specific async patterns
   - Include error handling from company docs

Company-specific skills to teach:
- async data fetching with company API
- useEffect cleanup in company patterns
- Promise chains in company architecture
```

---

## 📈 Benefits

### 1. **Targeted Learning**
- Modules laser-focused on exact weak areas
- No generic "review everything" modules

### 2. **Company Alignment**
- Every module uses company tech stack
- Real examples from company documentation
- Teaches company best practices and patterns

### 3. **Practical Application**
- User learns weak concepts in company context
- Immediately applicable to their work
- Bridges theory gap with company practice

### 4. **Efficiency**
- No time wasted on unrelated concepts
- Focused learning path
- Faster skill acquisition

### 5. **Measurable Progress**
- Skills covered directly map to quiz failures
- Can track improvement on retries
- Clear connection between learning and assessment

---

## 🔍 Logging Output Example

```
🔄 === ROADMAP REGENERATION START ===
✅ User fetched: John Doe
📚 Failed module: React Advanced Patterns
⏱️ Original training duration: 90 days
📅 Days spent: 30, Remaining days: 60

🧩 Mastered topics: 5
⚠️ Struggling areas: 8
❌ Wrong questions analyzed: 18
🎯 Weak concepts identified: async(5), useEffect(4), promises(3)

🔎 Fetching company training materials...
🎯 Fetching company docs for weak concepts...
  ✓ Fetched 4 docs for "async"
  ✓ Fetched 3 docs for "useEffect"
  ✓ Fetched 5 docs for "promises"

⚡ Total skill gap: 45 skills
🎯 Weakness-related gap: 12 skills
📚 Company skills for weak areas: async data fetching, useEffect lifecycle, 
    promise error handling, hook dependencies, cleanup functions

🧭 Regeneration plan created with 4 queries targeting weak areas
📄 Total context docs: 27 (15 base + 12 weakness-specific + 0 planned)

🤖 Generating new roadmap via agentic loop...
✅ New roadmap generated: 5 modules

💾 Saving new roadmap to Firestore...
🎉 Roadmap regeneration complete!
```

---

## ✅ Validation Checklist

When a module is generated, it should have:

- [ ] Module title references weak concept (e.g., "Mastering Async...")
- [ ] Description includes company context (e.g., "using company's API architecture")
- [ ] Skills covered include weak concepts (e.g., "async/await in React")
- [ ] Skills covered include company-specific items (e.g., "company API patterns")
- [ ] Estimated days fits within remaining time
- [ ] Module builds on company documentation content

---

## 🧪 Testing

### Test Case: Async Failures
```
1. User fails quiz with weak concepts: async, promises
2. System should:
   ✓ Fetch company docs about "async React implementation"
   ✓ Extract skills like "async data fetching", "error handling"
   ✓ Generate module: "Mastering Async in [Company Stack]"
   ✓ Module describes company-specific async patterns
   ✓ Skills include both "async/await" AND company practices
```

---

## 📝 Configuration

**Key Constants:**
```javascript
MAX_WEAK_CONCEPTS_FOR_DOCS = 5  // Fetch docs for top 5 weak concepts
MAX_CONTEXT_CHARS = 8000         // Total doc context limit
WEAKNESS_DOC_PRIORITY = true     // Prioritize weakness docs in merge
```

**Document Merge Strategy:**
```javascript
// Prevents duplicates, prioritizes by score
mergeDocs([...baseDocs, ...weaknessDocs, ...plannedDocs])
// Result: Unique docs sorted by relevance score
```

---

## 🎯 Summary

The enhanced system ensures that regenerated roadmaps are:

1. ✅ **Weakness-Focused** - Target exact quiz failures
2. ✅ **Company-Aligned** - Use company documentation & tech stack
3. ✅ **Practical** - Teach concepts via company examples
4. ✅ **Comprehensive** - Cover both theory and company practice
5. ✅ **Efficient** - Prioritize most relevant content

**Result:** Modules teach weak areas using company-specific knowledge, ensuring learners master concepts in the context they'll actually use them.

---

**Last Updated:** February 13, 2026  
**Status:** ✅ Fully Implemented
