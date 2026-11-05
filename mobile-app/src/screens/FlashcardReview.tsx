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

export default function FlashcardReview({
  onBack,
  colors,
  isDark,
  onToggleTheme,
}: Props) {
  const [showAnswer, setShowAnswer] = useState(false);
  const [currentCard, setCurrentCard] = useState(0);
  const [known, setKnown] = useState(0);
  const [isComplete, setIsComplete] = useState(false);

  const cards = [
    {
      question: 'What is Project Management?',
      answer:
        'Project Management is the process of planning, organizing, and controlling resources to achieve project goals.',
    },
    {
      question: 'What is the Project Management Triangle?',
      answer:
        'It represents three main constraints: Scope, Time, and Cost.',
    },
    {
      question: 'What is Project Scope?',
      answer:
        'Project Scope defines the work and activities required to complete a project.',
    },
  ];

  const nextCard = (isKnown: boolean) => {
  if (isKnown) {
    setKnown(previous => previous + 1);
  }

  setShowAnswer(false);

  if (currentCard === cards.length - 1) {
    setIsComplete(true);
  } else {
    setCurrentCard(previous => previous + 1);
  }
};
const restartReview = () => {
  setCurrentCard(0);
  setKnown(0);
  setShowAnswer(false);
  setIsComplete(false);
};
if (isComplete) {
  return (
    <View
      style={{
        flex: 1,
        backgroundColor: colors.background,
        justifyContent: 'center',
        alignItems: 'center',
        padding: 25,
      }}>
      <Text style={{fontSize: 55}}>🎉</Text>

      <Text
        style={{
          color: colors.text,
          fontSize: 26,
          fontWeight: 'bold',
          marginTop: 20,
          textAlign: 'center',
        }}>
        Review Completed!
      </Text>

      <Text
        style={{
          color: colors.secondary,
          fontSize: 15,
          marginTop: 12,
          textAlign: 'center',
        }}>
        You marked {known} out of {cards.length} cards as known.
      </Text>

      <TouchableOpacity
        style={{
          backgroundColor: '#7255D9',
          padding: 16,
          borderRadius: 13,
          marginTop: 25,
          width: '100%',
          alignItems: 'center',
        }}
        onPress={restartReview}>
        <Text style={{color: '#FFFFFF', fontWeight: 'bold'}}>
          ↻ Restart Review
        </Text>
      </TouchableOpacity>

      <TouchableOpacity
        onPress={onBack}
        style={{padding: 15, marginTop: 8}}>
        <Text style={{color: '#A78BFA', fontWeight: 'bold'}}>
          Back to Home
        </Text>
      </TouchableOpacity>
    </View>
  );
}
  return (
    <ScrollView
      style={{flex: 1, backgroundColor: colors.background}}
      contentContainerStyle={styles.container}>

      {/* Header */}
      <View style={[styles.header, {
        backgroundColor: colors.card,
        borderColor: colors.border,
      }]}>
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

      {/* Screen Title */}
      <Text style={[styles.title, {color: colors.text}]}>
        Flashcard Review
      </Text>

      <Text style={[styles.description, {color: colors.secondary}]}>
        Review important concepts and test your understanding.
      </Text>

      {/* Progress */}
      <View style={[styles.progressCard, {
        backgroundColor: colors.card,
        borderColor: colors.border,
      }]}>
        <Text style={[styles.progressText, {color: colors.text}]}>
          Card {currentCard + 1} of {cards.length}
        </Text>

        <View style={styles.progressBackground}>
          <View style={[
            styles.progressFill,
            {width: `${((currentCard + 1) / cards.length) * 100}%`},
          ]} />
        </View>
      </View>

      {/* Flashcard */}
      <TouchableOpacity
        activeOpacity={0.9}
        onPress={() => setShowAnswer(!showAnswer)}
        style={styles.flashcard}>

        <Text style={styles.cardLabel}>
          {showAnswer ? 'ANSWER' : 'QUESTION'}
        </Text>

        <Text style={styles.cardText}>
          {showAnswer
            ? cards[currentCard].answer
            : cards[currentCard].question}
        </Text>

        <Text style={styles.tapText}>
          {showAnswer ? 'Tap to see question' : 'Tap to reveal answer'}
        </Text>
      </TouchableOpacity>

      {/* Buttons */}
      <Text style={[styles.instruction, {color: colors.secondary}]}>
        How well did you understand this card?
      </Text>

      <View style={styles.buttonRow}>
        <TouchableOpacity
          style={styles.unknownButton}
          onPress={() => nextCard(false)}>
          <Text style={styles.buttonText}>Don't Know</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.knownButton}
          onPress={() => nextCard(true)}>
          <Text style={styles.buttonText}>✓  Know</Text>
        </TouchableOpacity>
      </View>

      <Text style={[styles.knownCount, {color: colors.secondary}]}>
        Cards marked Know: {known}
      </Text>
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
    backgroundColor: '#7856E8',
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoText: {
    color: '#FFFFFF',
    fontSize: 27,
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
  progressCard: {
    padding: 16,
    borderRadius: 15,
    borderWidth: 1,
    marginBottom: 25,
  },
  progressText: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 12,
  },
  progressBackground: {
    height: 7,
    backgroundColor: '#35395A',
    borderRadius: 10,
    overflow: 'hidden',
  },
  progressFill: {
    height: 7,
    backgroundColor: '#A78BFA',
    borderRadius: 10,
  },
  flashcard: {
    minHeight: 260,
    backgroundColor: '#29234F',
    borderRadius: 22,
    padding: 25,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 25,
  },
  cardLabel: {
    color: '#C4B5FD',
    fontSize: 12,
    fontWeight: 'bold',
    letterSpacing: 2,
    marginBottom: 25,
  },
  cardText: {
    color: '#FFFFFF',
    fontSize: 21,
    fontWeight: '600',
    textAlign: 'center',
    lineHeight: 31,
  },
  tapText: {
    color: '#C4B5FD',
    fontSize: 12,
    marginTop: 25,
  },
  instruction: {
    textAlign: 'center',
    fontSize: 13,
    marginBottom: 15,
  },
  buttonRow: {
    flexDirection: 'row',
    gap: 12,
  },
  unknownButton: {
    flex: 1,
    backgroundColor: '#D95770',
    padding: 15,
    borderRadius: 13,
    alignItems: 'center',
  },
  knownButton: {
    flex: 1,
    backgroundColor: '#258B72',
    padding: 15,
    borderRadius: 13,
    alignItems: 'center',
  },
  buttonText: {
    color: '#FFFFFF',
    fontWeight: 'bold',
    fontSize: 13,
  },
  knownCount: {
    textAlign: 'center',
    marginTop: 20,
    fontSize: 13,
  },
});