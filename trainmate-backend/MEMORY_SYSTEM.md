# Dynamic Agent Memory System

## Overview
The agent memory system has been upgraded to dynamically update based on user interactions, tracking learning progress, struggles, and achievements in real-time.

## TrainMate Project Use Cases

### 🏢 Platform Roles & Workflows

#### **1. Super Admin**
**Primary Responsibilities:**
- Manage the entire TrainMate platform
- Onboard and manage companies
- Control access and permissions
- Monitor platform-wide statistics

**Use Cases:**
- **UC-SA-01: Company Onboarding**
  - Super admin receives company registration request
  - Reviews company details and compliance
  - Approves/rejects company account
  - Assigns company-specific credentials
  - Configures company settings (departments, user limits)

- **UC-SA-02: Platform Monitoring**
  - Views dashboard with total companies, users, departments
  - Tracks active training sessions across companies
  - Reviews quiz completion rates and success metrics
  - Generates platform-wide performance reports
  - Identifies struggling companies for support

- **UC-SA-03: Company Management**
  - Updates company information (name, settings, status)
  - Toggles company active/inactive status
  - Deletes companies (with data archival)
  - Manages super admin accounts
  - Adjusts company quotas and limits

#### **2. Company Admin**
**Primary Responsibilities:**
- Manage company-specific training programs
- Oversee departments and users
- Configure onboarding content
- Track company-wide progress

**Use Cases:**
- **UC-CA-01: Department Management**
  - Creates new departments (Engineering, Sales, HR, etc.)
  - Assigns department-specific training materials
  - Uploads company documentation to knowledge base
  - Configures department-specific quizzes
  - Archives inactive departments

- **UC-CA-02: User (Fresher) Onboarding**
  - Adds new employees to the system
  - Assigns users to departments
  - Sets initial access permissions
  - Triggers automated roadmap generation
  - Monitors onboarding progress

- **UC-CA-03: Document Management**
  - Uploads company policies, procedures, handbooks
  - Ingests documents into Pinecone vector database
  - Tags documents by department
  - Updates existing training materials
  - Removes outdated documentation

- **UC-CA-04: Progress Tracking**
  - Views department-wise training progress
  - Identifies users struggling with modules
  - Reviews quiz performance across teams
  - Generates completion reports for management
  - Unlocks quizzes for users who failed (retry grants)

- **UC-CA-05: Company Settings**
  - Configures company onboarding questionnaire
  - Sets training policies (quiz pass %, retry limits)
  - Manages company profile information
  - Customizes training roadmap templates

#### **3. Fresher (New Employee)**
**Primary Responsibilities:**
- Complete assigned training modules
- Learn through AI chatbot interactions
- Pass module quizzes
- Track personal progress

**Use Cases:**
- **UC-FR-01: Onboarding Journey**
  - Logs in for the first time
  - Completes company onboarding questionnaire
  - Reviews auto-generated personalized roadmap
  - Sees modules with estimated completion days
  - Views current module status (pending/in-progress/completed)

- **UC-FR-02: Interactive Learning via Chatbot**
  - Opens active training module
  - Asks questions about module content
  - Receives AI-powered responses based on:
    - Company documentation (90% weight)
    - General knowledge sources (10% weight)
    - Personal learning history (dynamic memory)
  - Gets examples, explanations, and clarifications
  - Revisits previous chat sessions

- **UC-FR-03: Adaptive Learning Support**
  - Chatbot recognizes struggling areas from history
  - Receives targeted help on weak topics
  - Gets encouragement on mastered topics
  - Experiences personalized learning pace
  - Reviews past conversations for reference

- **UC-FR-04: Module Assessment**
  - Completes learning for a module
  - Takes AI-generated quiz (15 MCQs + 5 one-liners)
  - Questions sourced from company docs (90%) and learning context (10%)
  - Receives instant results with explanations
  - Passes (≥80%) → Module marked complete, next module unlocked
  - Fails (<80%) → Quiz locked, must contact admin for retry

- **UC-FR-05: Progress Monitoring**
  - Views personal training dashboard
  - Tracks completed vs remaining modules
  - Reviews quiz scores and performance history
  - Monitors days spent on current module
  - Celebrates achievements and milestones

- **UC-FR-06: Profile & Settings Management**
  - Updates personal information
  - Views department assignment
  - Reviews learning statistics
  - Manages notification preferences
  - Accesses help resources

### 🎯 End-to-End Training Flow

#### **Scenario: New Software Engineer Onboarding**

**Day 1 - Onboarding:**
1. Company admin adds "Sarah" to Engineering department
2. Sarah receives login credentials
3. Sarah logs in and completes onboarding questionnaire
4. System generates personalized roadmap:
   - Module 1: Company Culture & Values (3 days)
   - Module 2: Development Environment Setup (2 days)
   - Module 3: Code Review Process (4 days)
   - Module 4: Testing Best Practices (5 days)
   - Module 5: Deployment Pipeline (3 days)

**Day 1-3 - Module 1:**
5. Sarah starts "Company Culture & Values"
6. Opens chatbot and asks: "What is our company mission?"
7. Bot responds using company handbook documents
8. Sarah asks follow-up questions about team structure
9. Memory tracks: Sarah interested in "team collaboration", "company values"
10. Day 3: Sarah takes Module 1 quiz → Scores 92% → Passes ✓
11. Memory updated: Mastered "company culture", "team values"

**Day 4-5 - Module 2:**
12. Module 2 auto-unlocked: "Development Environment Setup"
13. Sarah asks: "How do I set up local environment?"
14. Bot provides step-by-step guide from engineering docs
15. Sarah struggles with Docker setup, asks multiple questions
16. Memory tracks: Struggling with "Docker", "containers"
17. Day 5: Takes quiz → Scores 75% → Fails ✗ (weak in Docker)
18. Quiz locked, Sarah contacts admin for retry

**Day 6 - Retry:**
19. Admin reviews Sarah's performance, grants retry
20. Sarah revisits Docker topics via chatbot
21. Bot recognizes struggling area, provides extra Docker support
22. Retakes quiz → Scores 88% → Passes ✓
23. Memory updated: Moved Docker from struggling to mastered

**Day 7-10 - Continued Learning:**
24. Sarah progresses through remaining modules
25. Bot adapts to her learning patterns
26. Provides proactive help on similar topics to past struggles
27. Builds on previously mastered concepts
28. Completes all modules by Day 17

**Post-Training:**
29. Company admin reviews completion report
30. Sarah joins production team with solid foundation
31. Training data used for improving future onboarding

### 🔄 System Integration Flow

**Document Ingestion Pipeline:**
```
Company Admin uploads PDF → TextExtractor extracts text → 
Text chunked (512 tokens) → Cohere embeddings generated → 
Stored in Pinecone with metadata (company, dept, source) → 
Available for RAG queries
```

**Chat Query Pipeline:**
```
User asks question → Cohere embeds question → 
Pinecone semantic search (company-dept filtered) → 
Relevant docs retrieved → Memory context added → 
Gemini generates response → Memory updated → 
Response returned to user
```

**Quiz Generation Pipeline:**
```
User requests quiz → Fetch company docs from Pinecone → 
Fetch agent memory summary → Build context (90% docs, 10% memory) → 
Gemini generates 15 MCQs + 5 one-liners → 
Quiz stored in Firestore → Returned to user
```

**Quiz Evaluation Pipeline:**
```
User submits answers → MCQs evaluated (index match) → 
One-liners evaluated (Gemini semantic match) → 
Score calculated → Pass/fail determined (80% threshold) → 
Results stored → Module status updated → 
Memory updated with performance data
```

### 💡 Advanced Use Cases

#### **UC-ADV-01: Cross-Department Knowledge Sharing**
- Company uploads general policies applicable to all departments
- Document tagged with multiple department filters
- Users from any department can access during training
- Reduces content duplication across departments

#### **UC-ADV-02: Progressive Learning Path**
- Roadmap modules have dependencies
- Advanced modules locked until prerequisites completed
- System tracks prerequisite completion
- Ensures logical learning progression

#### **UC-ADV-03: Performance Analytics**
- Company admin views heatmap of struggling topics
- Identifies common failure points in training
- Updates documentation to address gaps
- Tracks improvement in pass rates over time

#### **UC-ADV-04: Intelligent Retry Management**
- Admin sees quiz failure analytics
- Reviews specific weak topics for user
- Grants targeted retry with focus areas
- Tracks retry success rates

#### **UC-ADV-05: Chatbot Conversation History**
- User accesses previous chat sessions by date
- Reviews past learning discussions
- Continues conversations across sessions
- Memory persists learning context

#### **UC-ADV-06: Dynamic Content Updates**
- Company updates policy document
- Old version removed from Pinecone
- New version ingested with same tags
- Future queries use updated information
- No manual intervention for users

### 🎓 Learning Optimization Features

**Adaptive Question Difficulty:**
- Quiz difficulty adjusts based on memory
- Struggling users get foundational questions
- Advanced users get scenario-based questions

**Spaced Repetition Hints:**
- Memory tracks last interaction with topics
- Bot proactively reviews forgotten concepts
- Reminder prompts for important topics

**Confidence Scoring:**
- System tracks user confidence per topic
- Low confidence → More practice questions
- High confidence → Advanced challenges

**Peer Comparison (Anonymous):**
- Users see how their progress compares
- Motivates completion
- Identifies training bottlenecks

### 🔒 Security & Privacy Use Cases

**UC-SEC-01: Data Isolation**
- Each company's data stored in separate Firestore collections
- Pinecone namespaces per company
- No cross-company data leakage
- Company deletion removes all associated data

**UC-SEC-02: Role-Based Access**
- Super admin: Platform-wide access
- Company admin: Company-specific access only
- Fresher: Personal data + assigned modules only
- Firestore security rules enforce boundaries

**UC-SEC-03: Audit Trail**
- All document uploads logged with timestamp
- Quiz attempts tracked with results
- Admin actions logged for compliance
- Memory updates include metadata for transparency

## Architecture

### 1. Memory Service (`services/memoryService.js`)
Central service managing all memory operations with three main functions:

#### `updateMemoryAfterChat()`
- **Triggered**: After each chat interaction
- **Captures**:
  - User questions and bot responses
  - Key topics discussed
  - Areas where user struggles (repeated questions, confusion patterns)
  - Topics user has mastered (demonstrated understanding)
  - Learning patterns over time

- **Smart Features**:
  - LLM-powered semantic extraction of insights
  - Keeps last 10 interactions for context
  - Automatically summarizes conversations (max 500 chars)
  - Tracks cumulative key topics (max 10)
  - Tracks struggling areas (max 10)
  - Tracks mastered topics (max 10)

#### `updateMemoryAfterQuiz()`
- **Triggered**: After quiz submission
- **Captures**:
  - Quiz score and pass/fail status
  - Weak areas (incorrect questions)
  - Strong areas (correct questions)
  - Historical quiz performance (last 5 attempts)
  - Learning progress trends

- **Smart Features**:
  - Analyzes quiz questions to extract topic keywords
  - Updates struggling areas based on incorrect answers
  - Updates mastered topics based on correct answers
  - Generates actionable recommendations
  - Tracks quiz history for pattern recognition

#### `getAgentMemory()`
- **Purpose**: Retrieve current memory state
- **Returns**: Complete memory profile including summary, topics, and performance data

### 2. Chat Controller Integration
Enhanced to use dynamic memory:

**Before Chat**:
```javascript
// Retrieves current memory state
const memoryData = await getAgentMemory({
  userId, companyId, deptId, moduleId
});
```

**During Chat**:
- Includes memory summary in LLM prompt
- Shows struggling areas (for extra support)
- Shows mastered topics (to build upon)

**After Chat**:
```javascript
// Updates memory asynchronously (non-blocking)
updateMemoryAfterChat({
  userId, companyId, deptId, moduleId,
  userMessage, botReply
});
```

### 3. Quiz Controller Integration
Enhanced to update memory after quiz:

**After Quiz Evaluation**:
```javascript
// Updates memory with quiz results (async, non-blocking)
updateMemoryAfterQuiz({
  userId, companyId, deptId, moduleId,
  moduleTitle, score, passed,
  mcqResults, oneLinerResults
});
```

## Memory Data Structure

### Firestore Collection Path
```
freshers/{companyId}/departments/{deptId}/users/{userId}/roadmap/{moduleId}/agentMemory/summary
```

### Document Schema
```javascript
{
  // Concise learning summary (max 500 chars)
  summary: string,
  
  // Last 10 chat interactions
  interactions: [
    {
      userMessage: string,
      botReply: string,
      timestamp: Date
    }
  ],
  
  // Learning tracking
  keyTopics: [string],           // Max 10 topics discussed
  strugglingAreas: [string],      // Max 15 areas needing focus
  masteredTopics: [string],       // Max 15 topics understood
  
  // Quiz tracking
  quizAttempts: [
    {
      moduleTitle: string,
      score: number,
      passed: boolean,
      weakAreas: [string],
      strongAreas: [string],
      timestamp: Date
    }
  ],
  lastQuizScore: number,
  lastQuizPassed: boolean,
  
  // Metadata
  totalInteractions: number,
  lastUpdated: Timestamp
}
```

## Features

### ✅ Real-time Learning Tracking
- Automatically identifies when user asks repeated questions about same topic
- Tracks which topics user demonstrates understanding of
- Builds comprehensive learning profile over time

### ✅ Personalized Support
- Chat responses adapt based on struggling areas
- Provides extra support for challenging topics
- Builds on mastered topics for advanced learning

### ✅ Quiz Intelligence
- Analyzes quiz performance patterns
- Identifies knowledge gaps from incorrect answers
- Recognizes strengths from correct answers
- Tracks improvement over multiple attempts

### ✅ Smart Summarization
- LLM-powered memory summarization
- Keeps memory concise (500 char limit)
- Focuses on actionable insights
- Maintains historical context

### ✅ Non-blocking Updates
- Memory updates happen asynchronously
- No impact on response time
- Graceful error handling with fallbacks
- Continues working even if memory update fails

## Usage Examples

### Scenario 1: User Struggling with a Topic
1. User asks: "What is REST API?" 
2. Bot explains REST APIs
3. Memory updated: Adds "REST API" to key topics
4. Later, user asks: "How do APIs work?"
5. Memory notes: User asking repeated API questions
6. Memory adds "API concepts" to struggling areas
7. Next chat: Bot provides extra support for API-related questions

### Scenario 2: Quiz Performance Tracking
1. User takes quiz on "JavaScript Fundamentals"
2. Score: 75% (failed)
3. Weak areas: "Closures", "Async/Await"
4. Memory updated with struggling areas
5. Next chat: Bot notices struggling areas
6. Bot provides targeted help on closures and async concepts
7. User retakes quiz: 90% (passed)
8. Memory updated: Removes from struggling, adds to mastered

### Scenario 3: Learning Progress
1. Week 1: Many questions, several struggles
2. Memory tracks: "Variables", "Functions" in struggling areas
3. Week 2: Fewer questions on basics, more advanced topics
4. Quiz: Good performance on basics
5. Memory updates: Basics moved to mastered topics
6. Week 3: Bot adapts to build on mastered concepts
7. Bot focuses support on remaining struggles

## Configuration

### Environment Variables
- `GEMINI_API_KEY`: Required for LLM-powered memory summarization

### Tuning Parameters
```javascript
// In memoryService.js

// Number of recent interactions to keep
const MAX_INTERACTIONS = 10;

// Maximum summary length
const MAX_SUMMARY_LENGTH = 500;

// Maximum tracked items
const MAX_KEY_TOPICS = 10;
const MAX_STRUGGLING_AREAS = 15;
const MAX_MASTERED_TOPICS = 15;
const MAX_QUIZ_ATTEMPTS = 5;
```

## Testing

### Manual Testing
1. **Chat Memory Update**:
   - Send multiple chat messages
   - Check Firestore: `agentMemory/summary` document
   - Verify `interactions` array updates
   - Verify `totalInteractions` increments

2. **Quiz Memory Update**:
   - Submit a quiz (pass or fail)
   - Check Firestore: `agentMemory/summary` document
   - Verify `quizAttempts` array updates
   - Verify `strugglingAreas` or `masteredTopics` updated

3. **Memory Retrieval**:
   - Start new chat session
   - Check console logs for memory retrieval
   - Verify struggling areas shown in prompt
   - Verify bot adapts responses based on memory

### Expected Console Logs
```
✅ Agent memory updated: 3 interactions tracked
📝 Agent Memory: User is learning JavaScript basics...
⚠️  Struggling with: API concepts, Closures, Promises
✅ Mastered: Variables, Functions, Arrays
✅ Agent memory updated after quiz: score=85%, passed=true
```

## Error Handling

### Graceful Degradation
- If memory update fails, chat/quiz continues normally
- Warnings logged without blocking user experience
- Fallback to basic memory structure if LLM fails
- Empty arrays if memory doesn't exist yet

### Common Issues
1. **Memory not updating**: Check Firestore permissions
2. **LLM errors**: Verify GEMINI_API_KEY is set
3. **Missing fields**: System auto-creates with defaults

## Performance

- **Memory updates**: Async, non-blocking (< 2s typically)
- **Memory retrieval**: Single Firestore read (< 100ms)
- **Storage impact**: ~1-2 KB per user per module
- **LLM calls**: 2 per chat update, 1 per quiz update

## Future Enhancements

### Potential Improvements
1. **Spaced Repetition**: Remind users to review struggling topics
2. **Progress Visualization**: Show memory insights in UI
3. **Cross-module Learning**: Track learning patterns across modules
4. **Collaborative Learning**: Identify common struggles across users
5. **Adaptive Difficulty**: Adjust quiz difficulty based on memory
6. **Learning Style Detection**: Identify preferred learning patterns
7. **Predictive Support**: Proactively offer help before user struggles

## Maintenance

### Regular Monitoring
- Check memory update success rate in logs
- Monitor LLM API usage and costs
- Review memory size growth per user
- Validate memory accuracy periodically

### Data Cleanup
- Old memory automatically trimmed (interactions, attempts)
- No manual cleanup needed for normal operation
- Consider archiving for long-inactive users (optional)

---

**Implementation Status**: ✅ Complete and Active
**Last Updated**: February 12, 2026
**Version**: 1.0.0
