// Feature access control based on license plan

export const FEATURE_FLAGS = {
  // Basic License Features
  BASIC_ROADMAP: 'basicRoadmap',
  EMAIL_UPDATES: 'emailUpdates',
  CALENDAR_INTEGRATION: 'calendarIntegration',
  BASIC_CERTIFICATE: 'basicCertificate',
  ADMIN_PROGRESS_VIEW: 'adminProgressView',
  
  // Pro License Features (in addition to Basic)
  MODULE_QUIZZES: 'moduleQuizzes',
  AGENTIC_EMAILS: 'agenticEmails',
  CALENDAR_AUTOMATION: 'calendarAutomation',
  WEAK_AREA_ROADMAP: 'weakAreaRoadmap',
  AGENTIC_SCORES: 'agenticScores',
  FINAL_QUIZ: 'finalQuiz',
  CHATBOT: 'chatbot',
};

const BASIC_FEATURES = new Set([
  FEATURE_FLAGS.BASIC_ROADMAP,
  FEATURE_FLAGS.EMAIL_UPDATES,
  FEATURE_FLAGS.CALENDAR_INTEGRATION,
  FEATURE_FLAGS.BASIC_CERTIFICATE,
  FEATURE_FLAGS.ADMIN_PROGRESS_VIEW,
  FEATURE_FLAGS.CHATBOT,
]);

const PRO_FEATURES = new Set([
  ...BASIC_FEATURES,
  FEATURE_FLAGS.MODULE_QUIZZES,
  FEATURE_FLAGS.AGENTIC_EMAILS,
  FEATURE_FLAGS.CALENDAR_AUTOMATION,
  FEATURE_FLAGS.WEAK_AREA_ROADMAP,
  FEATURE_FLAGS.AGENTIC_SCORES,
  FEATURE_FLAGS.FINAL_QUIZ,
]);

/**
 * Get available features for a given license plan
 * @param {string} licensePlan - "License Basic" or "License Pro"
 * @returns {Set<string>} Set of available feature flags
 */
export const getAvailableFeatures = (licensePlan) => {
  if (licensePlan === 'License Pro') {
    return PRO_FEATURES;
  }
  return BASIC_FEATURES;
};

/**
 * Check if a feature is available for the given license plan
 * @param {string} licensePlan - "License Basic" or "License Pro"
 * @param {string} feature - Feature flag from FEATURE_FLAGS
 * @returns {boolean} Whether the feature is available
 */
export const isFeatureAvailable = (licensePlan, feature) => {
  const availableFeatures = getAvailableFeatures(licensePlan);
  return availableFeatures.has(feature);
};

/**
 * Get upgrade suggestion message for unavailable feature
 * @param {string} feature - Feature flag from FEATURE_FLAGS
 * @returns {string} Upgrade message
 */
export const getUpgradeMessage = (feature) => {
  const messages = {
    [FEATURE_FLAGS.MODULE_QUIZZES]: 'Quizzes are available in Pro plan. Upgrade to unlock assessment features.',
    [FEATURE_FLAGS.AGENTIC_EMAILS]: 'Agentic email nudges are available in Pro plan.',
    [FEATURE_FLAGS.CALENDAR_AUTOMATION]: 'Calendar automation is available in Pro plan.',
    [FEATURE_FLAGS.WEAK_AREA_ROADMAP]: 'Weak-area roadmap regeneration is available in Pro plan.',
    [FEATURE_FLAGS.AGENTIC_SCORES]: 'Agentic scoring is available in Pro plan.',
    [FEATURE_FLAGS.FINAL_QUIZ]: 'Final certification quiz is available in Pro plan.',
    [FEATURE_FLAGS.CHATBOT]: 'AI Assistant/Chatbot is available in all plans.',
  };

  return messages[feature] || 'This feature is available in Pro plan. Upgrade to access it.';
};

/**
 * Feature access control hook (for React components)
 * @param {string} licensePlan - "License Basic" or "License Pro"
 * @returns {Object} Object with utility functions for feature access
 */
export const useFeatureAccess = (licensePlan) => {
  return {
    isFeatureAvailable: (feature) => isFeatureAvailable(licensePlan, feature),
    getUpgradeMessage: (feature) => getUpgradeMessage(feature),
    isProLicense: () => licensePlan === 'License Pro',
    isBasicLicense: () => licensePlan === 'License Basic',
  };
};
