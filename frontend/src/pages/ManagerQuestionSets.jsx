import ManagerAssessmentSets from "./ManagerAssessmentSets";

/**
 * Compatibility entry point for the manager question workspace route.
 *
 * The assessment-authoring implementation lives in ManagerAssessmentSets.jsx.
 * This wrapper preserves the existing route without duplicating functionality.
 */
function ManagerQuestionSetQuestions() {
  return <ManagerAssessmentSets />;
}

export default ManagerQuestionSetQuestions;
