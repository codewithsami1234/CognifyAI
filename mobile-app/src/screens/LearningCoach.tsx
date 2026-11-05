
import React from 'react';
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

export default function LearningCoach({
  onBack,
  colors,
  isDark,
  onToggleTheme,
}: Props) {
  const recommendations = [
    {
      icon: '📘',
      title: 'Revise Project Scope',
      description: 'Review the definition and key elements of project scope.',
      tag: 'Needs Revision',
    },
    {
      icon: '📊',
      title: 'Practice S-Curve Concepts',
      description: 'Strengthen your understanding of project progress graphs.',
      tag: 'Recommended',
    },
    {
      icon: '🎯',
      title: 'Retake Smart Assessment',
      description: 'Attempt another quiz to check your understanding.',
      tag: 'Practice',
    },
  ];

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

    {/* Back Button */}
<TouchableOpacity
  style={styles.backHomeButton}
  onPress={onBack}>
  <Text style={styles.backArrow}>‹</Text>
  <Text style={styles.backHomeText}>Back to Home</Text>
</TouchableOpacity>

      {/* Page Title */}
      <Text style={[styles.title, {color: colors.text}]}>
        🎯 Learning Coach
      </Text>

      <Text style={[styles.description, {color: colors.secondary}]}>
        Understand your learning progress and discover what to revise next.
      </Text>

      {/* Overall Progress */}
      <View
        style={[
          styles.progressCard,
          {
            backgroundColor: colors.card,
            borderColor: colors.border,
          },
        ]}>
        <Text style={[styles.cardTitle, {color: colors.text}]}>
          Overall Learning Progress
        </Text>

        <View style={styles.progressRow}>
          <Text style={styles.progressNumber}>72%</Text>
          <Text style={[styles.progressLabel, {color: colors.secondary}]}>
            Sample progress
          </Text>
        </View>

        <View style={styles.progressBackground}>
          <View style={styles.progressFill} />
        </View>

        <Text style={[styles.smallText, {color: colors.secondary}]}>
          Keep studying regularly to improve your progress.
        </Text>
      </View>

      {/* Statistics */}
      <Text style={[styles.sectionTitle, {color: colors.text}]}>
        Learning Overview
      </Text>

      <View style={styles.statsGrid}>
        <View
          style={[
            styles.statCard,
            {
              backgroundColor: colors.card,
              borderColor: colors.border,
            },
          ]}>
          <Text style={styles.statIcon}>📚</Text>
          <Text style={[styles.statNumber, {color: colors.text}]}>3</Text>
          <Text style={[styles.statLabel, {color: colors.secondary}]}>
            Documents
          </Text>
        </View>

        <View
          style={[
            styles.statCard,
            {
              backgroundColor: colors.card,
              borderColor: colors.border,
            },
          ]}>
          <Text style={styles.statIcon}>📝</Text>
          <Text style={[styles.statNumber, {color: colors.text}]}>2</Text>
          <Text style={[styles.statLabel, {color: colors.secondary}]}>
            Quizzes
          </Text>
        </View>

        <View
          style={[
            styles.statCard,
            {
              backgroundColor: colors.card,
              borderColor: colors.border,
            },
          ]}>
          <Text style={styles.statIcon}>🔥</Text>
          <Text style={[styles.statNumber, {color: colors.text}]}>4</Text>
          <Text style={[styles.statLabel, {color: colors.secondary}]}>
            Day Streak
          </Text>
        </View>

        <View
          style={[
            styles.statCard,
            {
              backgroundColor: colors.card,
              borderColor: colors.border,
            },
          ]}>
          <Text style={styles.statIcon}>🗂️</Text>
          <Text style={[styles.statNumber, {color: colors.text}]}>5</Text>
          <Text style={[styles.statLabel, {color: colors.secondary}]}>
            Flashcards
          </Text>
        </View>
      </View>

      {/* Weak Topics */}
      <Text style={[styles.sectionTitle, {color: colors.text}]}>
        Topics to Improve
      </Text>

      <View
        style={[
          styles.topicCard,
          {
            backgroundColor: colors.card,
            borderColor: colors.border,
          },
        ]}>
        <View style={styles.topicHeader}>
          <Text style={[styles.topicName, {color: colors.text}]}>
            Project Scope
          </Text>
          <Text style={styles.topicPercentage}>45%</Text>
        </View>

        <View style={styles.topicBarBackground}>
          <View style={[styles.topicBarFill, {width: '45%'}]} />
        </View>

        <Text style={[styles.smallText, {color: colors.secondary}]}>
          More revision recommended
        </Text>
      </View>

      <View
        style={[
          styles.topicCard,
          {
            backgroundColor: colors.card,
            borderColor: colors.border,
          },
        ]}>
        <View style={styles.topicHeader}>
          <Text style={[styles.topicName, {color: colors.text}]}>
            S-Curve
          </Text>
          <Text style={styles.topicPercentage}>60%</Text>
        </View>

        <View style={styles.topicBarBackground}>
          <View style={[styles.topicBarFill, {width: '60%'}]} />
        </View>

        <Text style={[styles.smallText, {color: colors.secondary}]}>
          Continue practicing
        </Text>
      </View>

      {/* Recommendations */}
      <Text style={[styles.sectionTitle, {color: colors.text}]}>
        Recommended for You
      </Text>

      {recommendations.map((item, index) => (
        <View
          key={index}
          style={[
            styles.recommendationCard,
            {
              backgroundColor: colors.card,
              borderColor: colors.border,
            },
          ]}>
          <Text style={styles.recommendationIcon}>{item.icon}</Text>

          <View style={{flex: 1}}>
            <Text style={[styles.recommendationTitle, {color: colors.text}]}>
              {item.title}
            </Text>

            <Text
              style={[
                styles.recommendationDescription,
                {color: colors.secondary},
              ]}>
              {item.description}
            </Text>

            <Text style={styles.recommendationTag}>
              {item.tag}
            </Text>
          </View>
        </View>
      ))}

      <View style={styles.footer}>
        <Text style={[styles.footerText, {color: colors.secondary}]}>
          Your learning journey, one step at a time.
        </Text>
      </View>
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
  progressCard: {
    padding: 20,
    borderRadius: 18,
    borderWidth: 1,
  },
  cardTitle: {
    fontSize: 17,
    fontWeight: 'bold',
    marginBottom: 15,
  },
  progressRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    marginBottom: 12,
  },
  progressNumber: {
    color: '#A78BFA',
    fontSize: 32,
    fontWeight: 'bold',
    marginRight: 10,
  },
  progressLabel: {
    fontSize: 12,
  },
  progressBackground: {
    height: 9,
    backgroundColor: '#343052',
    borderRadius: 10,
    overflow: 'hidden',
    marginBottom: 12,
  },
  progressFill: {
    width: '72%',
    height: 9,
    backgroundColor: '#A78BFA',
    borderRadius: 10,
  },
  smallText: {
    fontSize: 12,
    lineHeight: 18,
  },
  sectionTitle: {
    fontSize: 19,
    fontWeight: 'bold',
    marginTop: 27,
    marginBottom: 14,
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },
  statCard: {
    width: '48%',
    padding: 17,
    borderRadius: 16,
    borderWidth: 1,
    marginBottom: 13,
  },
  statIcon: {
    fontSize: 23,
    marginBottom: 9,
  },
  statNumber: {
    fontSize: 25,
    fontWeight: 'bold',
    marginBottom: 4,
  },
  statLabel: {
    fontSize: 12,
  },
  topicCard: {
    padding: 17,
    borderRadius: 16,
    borderWidth: 1,
    marginBottom: 12,
  },
  topicHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  topicName: {
    fontSize: 14,
    fontWeight: 'bold',
  },
  topicPercentage: {
    color: '#A78BFA',
    fontSize: 13,
    fontWeight: 'bold',
  },
  topicBarBackground: {
    height: 8,
    backgroundColor: '#343052',
    borderRadius: 10,
    overflow: 'hidden',
    marginBottom: 10,
  },
  topicBarFill: {
    height: 8,
    backgroundColor: '#A78BFA',
    borderRadius: 10,
  },
  recommendationCard: {
    flexDirection: 'row',
    padding: 17,
    borderRadius: 16,
    borderWidth: 1,
    marginBottom: 12,
  },
  recommendationIcon: {
    fontSize: 25,
    marginRight: 13,
  },
  recommendationTitle: {
    fontSize: 14,
    fontWeight: 'bold',
    marginBottom: 6,
  },
  recommendationDescription: {
    fontSize: 12,
    lineHeight: 18,
  },
  recommendationTag: {
    color: '#A78BFA',
    fontSize: 11,
    fontWeight: 'bold',
    marginTop: 9,
  },
  footer: {
    alignItems: 'center',
    marginTop: 20,
  },
  footerText: {
    fontSize: 12,
  },
});
