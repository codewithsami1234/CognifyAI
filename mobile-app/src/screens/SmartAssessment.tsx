
import React, {useState} from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
} from 'react-native';

type Props = {
  onBack: () => void;
  colors: any;
  isDark: boolean;
  onToggleTheme: () => void;
};

const questions = [
  {
    question: 'What is Project Management?',
    options: [
      'Planning and managing project activities',
      'Only writing project reports',
      'Only managing employees',
      'Avoiding project planning',
    ],
    answer: 0,
  },
  {
    question: 'Which three constraints form the Project Management Triangle?',
    options: [
      'Quality, Risk, and Team',
      'Scope, Time, and Cost',
      'Planning, Testing, and Design',
      'People, Tools, and Budget',
    ],
    answer: 1,
  },
  {
    question: 'What does Project Scope define?',
    options: [
      'The project manager salary',
      'The project completion date only',
      'The work required to complete a project',
      'The number of employees only',
    ],
    answer: 2,
  },
  {
    question: 'What is the main purpose of an S-Curve?',
    options: [
      'To show project data over time',
      'To design a project logo',
      'To select team members',
      'To write project objectives',
    ],
    answer: 0,
  },
  {
    question: 'What should a project manager do when time is limited?',
    options: [
      'Ignore project scope',
      'Stop monitoring progress',
      'Review priorities and available resources',
      'Avoid communicating with the team',
    ],
    answer: 2,
  },
];

export default function SmartAssessment({
  onBack,
  colors,
  isDark,
  onToggleTheme,
}: Props) {
  const [quizStarted, setQuizStarted] = useState(false);
  const [currentQuestion, setCurrentQuestion] = useState(0);
  const [selectedOption, setSelectedOption] = useState<number | null>(null);
  const [score, setScore] = useState(0);
  const [quizCompleted, setQuizCompleted] = useState(false);

  const handleNext = () => {
    if (selectedOption === null) {
      return;
    }

    const isCorrect =
      selectedOption === questions[currentQuestion].answer;

    if (isCorrect) {
      setScore(previous => previous + 1);
    }

    if (currentQuestion === questions.length - 1) {
      setQuizCompleted(true);
    } else {
      setCurrentQuestion(previous => previous + 1);
      setSelectedOption(null);
    }
  };

  const restartQuiz = () => {
    setQuizStarted(false);
    setCurrentQuestion(0);
    setSelectedOption(null);
    setScore(0);
    setQuizCompleted(false);
  };

  const progress = ((currentQuestion + 1) / questions.length) * 100;

  return (
    <ScrollView
      style={{flex: 1, backgroundColor: colors.background}}
      contentContainerStyle={styles.container}>

      {/* Brand Header */}
      <View
        style={[
          styles.header,
          {
            backgroundColor: colors.card,
            borderColor: colors.border,
          },
        ]}>
        <View style={styles.logo}>
          <Text style={styles.logoText}>✦</Text>
        </View>

        <View style={{flex: 1, marginLeft: 12}}>
          <Text style={[styles.brand, {color: colors.text}]}>
            Cognify <Text style={{color: '#A78BFA'}}>AI</Text>
          </Text>
          <Text style={[styles.tagline, {color: colors.secondary}]}>
            INTELLIGENT LEARNING EXPERIENCE
          </Text>
        </View>

        <TouchableOpacity onPress={onToggleTheme}>
          <Text style={{fontSize: 22}}>
            {isDark ? '☀️' : '🌙'}
          </Text>
        </TouchableOpacity>
      </View>

      <TouchableOpacity
  style={styles.backHomeButton}
  onPress={onBack}>
  <Text style={styles.backArrow}>‹</Text>
  <Text style={styles.backHomeText}>Back to Home</Text>
</TouchableOpacity>

      <Text style={[styles.title, {color: colors.text}]}>
        📝 Smart Assessment
      </Text>

      <Text style={[styles.description, {color: colors.secondary}]}>
        Test your knowledge and check your understanding.
      </Text>

      {/* Quiz Introduction */}
      {!quizStarted && !quizCompleted && (
        <View
          style={[
            styles.infoCard,
            {
              backgroundColor: colors.card,
              borderColor: colors.border,
            },
          ]}>
          <Text style={[styles.cardHeading, {color: colors.text}]}>
            Ready to Test Yourself?
          </Text>

          <Text style={[styles.infoText, {color: colors.secondary}]}>
            Answer the following questions to evaluate your understanding
            of Project Management.
          </Text>

          <View style={styles.infoRow}>
            <View style={styles.infoItem}>
              <Text style={styles.infoIcon}>❓</Text>
              <Text style={[styles.infoValue, {color: colors.text}]}>
                5 Questions
              </Text>
            </View>

            <View style={styles.infoItem}>
              <Text style={styles.infoIcon}>⏱️</Text>
              <Text style={[styles.infoValue, {color: colors.text}]}>
                5–10 Minutes
              </Text>
            </View>
          </View>

          <View style={styles.infoRow}>
            <View style={styles.infoItem}>
              <Text style={styles.infoIcon}>📊</Text>
              <Text style={[styles.infoValue, {color: colors.text}]}>
                MCQ Quiz
              </Text>
            </View>

            <View style={styles.infoItem}>
              <Text style={styles.infoIcon}>🎯</Text>
              <Text style={[styles.infoValue, {color: colors.text}]}>
                Instant Score
              </Text>
            </View>
          </View>

         <TouchableOpacity
  style={styles.primaryButton}
  onPress={() => setQuizStarted(true)}>
  <Text style={styles.primaryButtonText}>
    Start Assessment
    <Text style={styles.buttonArrow}>  ➜</Text>
  </Text>
</TouchableOpacity>
</View>
      )}

      {/* Quiz Questions */}
      {quizStarted && !quizCompleted && (
        <View>
          <View
            style={[
              styles.progressCard,
              {
                backgroundColor: colors.card,
                borderColor: colors.border,
              },
            ]}>
            <View style={styles.progressTop}>
              <Text style={[styles.progressLabel, {color: colors.text}]}>
                Question {currentQuestion + 1} of {questions.length}
              </Text>

              <Text style={styles.progressPercentage}>
                {Math.round(progress)}%
              </Text>
            </View>

            <View style={styles.progressBackground}>
              <View
                style={[
                  styles.progressFill,
                  {width: `${progress}%`},
                ]}
              />
            </View>
          </View>

          <View
            style={[
              styles.questionCard,
              {
                backgroundColor: colors.card,
                borderColor: colors.border,
              },
            ]}>
            <Text style={styles.questionLabel}>QUESTION</Text>

            <Text style={[styles.questionText, {color: colors.text}]}>
              {questions[currentQuestion].question}
            </Text>

            <Text style={[styles.selectText, {color: colors.secondary}]}>
              Select one correct answer:
            </Text>

            {questions[currentQuestion].options.map((option, index) => {
              const isSelected = selectedOption === index;

              return (
                <TouchableOpacity
                  key={index}
                  activeOpacity={0.8}
                  onPress={() => setSelectedOption(index)}
                  style={[
                    styles.option,
                    {
                      backgroundColor: isSelected
                        ? '#5541A8'
                        : colors.input,
                      borderColor: isSelected
                        ? '#A78BFA'
                        : colors.border,
                    },
                  ]}>
                  <Text
                    style={[
                      styles.optionLetter,
                      {color: isSelected ? '#FFFFFF' : colors.secondary},
                    ]}>
                    {String.fromCharCode(65 + index)}
                  </Text>

                  <Text
                    style={[
                      styles.optionText,
                      {color: isSelected ? '#FFFFFF' : colors.text},
                    ]}>
                    {option}
                  </Text>
                </TouchableOpacity>

              );
            })}

            <TouchableOpacity
              style={[
                styles.primaryButton,
                selectedOption === null && styles.disabledButton,
              ]}
              disabled={selectedOption === null}
              onPress={handleNext}>
              <Text style={styles.primaryButtonText}>
  {currentQuestion === questions.length - 1 ? (
    'Finish Quiz  ✓'
  ) : (
    <>
      Next Question
      <Text style={styles.buttonArrow}>  ➜</Text>
    </>
  )}
</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* Quiz Result */}
      {quizCompleted && (
        <View
          style={[
            styles.resultCard,
            {
              backgroundColor: colors.card,
              borderColor: colors.border,
            },
          ]}>
          <Text style={styles.resultIcon}>🏆</Text>

          <Text style={[styles.resultTitle, {color: colors.text}]}>
            Assessment Completed!
          </Text>

          <Text style={styles.scoreText}>
            {score} / {questions.length}
          </Text>

          <Text style={[styles.infoText, {color: colors.secondary}]}>
            You answered {score} out of {questions.length} questions correctly.
          </Text>

          <Text style={[styles.resultMessage, {color: colors.text}]}>
            {score === questions.length
              ? 'Excellent work! You answered every question correctly.'
              : score >= 3
              ? 'Good effort! Keep revising to improve your understanding.'
              : 'Keep practicing. Reviewing your study material can help.'}
          </Text>

          <TouchableOpacity
            style={styles.primaryButton}
            onPress={restartQuiz}>
            <Text style={styles.primaryButtonText}>
              ↻  Try Again
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.secondaryButton}
            onPress={onBack}>
            <Text style={styles.secondaryButtonText}>
              Back to Home
            </Text>
          </TouchableOpacity>
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 22,
    paddingTop: 45,
    paddingBottom: 40,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 15,
    borderRadius: 18,
    borderWidth: 1,
    marginBottom: 25,
  },
  logo: {
    width: 46,
    height: 46,
    borderRadius: 14,
    backgroundColor: '#7255D9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoText: {
    color: '#FFFFFF',
    fontSize: 25,
  },
  brand: {
    fontSize: 21,
    fontWeight: 'bold',
  },
  tagline: {
    fontSize: 8,
    letterSpacing: 1,
    marginTop: 4,
  },
backHomeButton: {
  alignSelf: 'flex-start',
  flexDirection: 'row',
  alignItems: 'center',
  justifyContent: 'center',
  backgroundColor: '#7856E8',
  paddingHorizontal: 16,
  paddingVertical: 11,
  borderRadius: 12,
  marginTop: 15,
  marginBottom: 30,
  gap: 9,
},
backArrow: {
  color: '#FFFFFF',
  fontSize: 30,
  fontWeight: '800',
  marginRight: 5,
  lineHeight: 25,
  includeFontPadding: false,
},
backHomeText: {
  color: '#FFFFFF',
  fontSize: 13,
  fontWeight: 'bold',
},
  title: {
    fontSize: 27,
    fontWeight: 'bold',
    marginBottom: 8,
  },
  description: {
    fontSize: 14,
    lineHeight: 21,
    marginBottom: 25,
  },
  infoCard: {
    padding: 20,
    borderRadius: 20,
    borderWidth: 1,
  },
  cardHeading: {
    fontSize: 21,
    fontWeight: 'bold',
    marginBottom: 10,
  },
  infoText: {
    fontSize: 14,
    lineHeight: 22,
    marginBottom: 20,
  },
  infoRow: {
    flexDirection: 'row',
    marginBottom: 20,
  },
  infoItem: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
  },
  infoIcon: {
    fontSize: 19,
    marginRight: 8,
  },
  infoValue: {
    fontSize: 12,
    fontWeight: '600',
  },
  primaryButton: {
    backgroundColor: '#7255D9',
    paddingVertical: 16,
    borderRadius: 13,
    alignItems: 'center',
    marginTop: 15,
  },
  primaryButtonText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: 'bold',
  },
  buttonArrow: {
  fontSize: 20,
  fontWeight: 'bold',
},
  disabledButton: {
    opacity: 0.45,
  },
  progressCard: {
    padding: 17,
    borderRadius: 16,
    borderWidth: 1,
    marginBottom: 18,
  },
  progressTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  progressLabel: {
    fontSize: 14,
    fontWeight: '600',
  },
  progressPercentage: {
    color: '#A78BFA',
    fontWeight: 'bold',
  },
  progressBackground: {
    height: 8,
    backgroundColor: '#343052',
    borderRadius: 10,
    overflow: 'hidden',
  },
  progressFill: {
    height: 8,
    backgroundColor: '#A78BFA',
    borderRadius: 10,
  },
  questionCard: {
    padding: 20,
    borderRadius: 20,
    borderWidth: 1,
  },
  questionLabel: {
    color: '#A78BFA',
    fontSize: 12,
    fontWeight: 'bold',
    letterSpacing: 1,
    marginBottom: 13,
  },
  questionText: {
    fontSize: 19,
    lineHeight: 28,
    fontWeight: 'bold',
    marginBottom: 12,
  },
  selectText: {
    fontSize: 13,
    marginBottom: 15,
  },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    borderRadius: 13,
    borderWidth: 1,
    marginBottom: 11,
  },
  optionLetter: {
    fontSize: 14,
    fontWeight: 'bold',
    marginRight: 12,
  },
  optionText: {
    flex: 1,
    fontSize: 13,
    lineHeight: 19,
  },
  resultCard: {
    padding: 23,
    borderRadius: 20,
    borderWidth: 1,
    alignItems: 'center',
  },
  resultIcon: {
    fontSize: 55,
    marginBottom: 15,
  },
  resultTitle: {
    fontSize: 22,
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: 15,
  },
  scoreText: {
    color: '#A78BFA',
    fontSize: 42,
    fontWeight: 'bold',
    marginBottom: 12,
  },
  resultMessage: {
    fontSize: 14,
    lineHeight: 22,
    textAlign: 'center',
    marginBottom: 15,
  },
  secondaryButton: {
    paddingVertical: 15,
    alignItems: 'center',
    marginTop: 10,
  },
  secondaryButtonText: {
    color: '#A78BFA',
    fontSize: 14,
    fontWeight: 'bold',
  },
});
