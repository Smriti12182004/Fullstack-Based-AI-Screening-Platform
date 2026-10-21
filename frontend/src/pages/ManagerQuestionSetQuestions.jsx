import ManagerAssessmentSets from "./ManagerAssessmentSets";

/**
 * Compatibility entry point for the manager question workspace route.
 *
 * The assessment-authoring implementation now lives in ManagerAssessmentSets.jsx.
 * Keeping this component as a thin wrapper avoids maintaining two competing
 * question-authoring implementations for the same route.
 */
function ManagerQuestionSetQuestions() {
  return <ManagerAssessmentSets />;
}

export default ManagerQuestionSetQuestions;