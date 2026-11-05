import {
  initializeDatabase,
  registerUser,
  loginUser,
  searchDocumentChunks,
} from './src/database/database';
import FlashcardReview from './src/screens/FlashcardReview';
import SmartAssessment from './src/screens/SmartAssessment';
import LearningCoach from './src/screens/LearningCoach';

import React, {useEffect, useRef, useState} from 'react';
import DocumentUpload from './src/screens/DocumentUpload';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  StatusBar,
  Animated,
  Easing,
  TouchableOpacity,
  ScrollView,
  Alert,
  ActivityIndicator,
} from 'react-native';

function BrandHeader({
  colors,
  isDark,
  onToggleTheme,
}: {
  colors: any;
  isDark: boolean;
  onToggleTheme: () => void;
}) {
  return (
    <View
      style={[
        styles.brandHeader,
        {
          backgroundColor: colors.card,
          borderColor: colors.border,
        },
      ]}>
      <View style={styles.brandLogo}>
        <Text style={styles.brandLogoText}>✦</Text>
      </View>

      <View style={styles.brandInfo}>
        <Text style={[styles.brandName, {color: colors.text}]}>
          Cognify <Text style={styles.aiText}>AI</Text>
        </Text>

        <Text style={[styles.brandTagline, {color: colors.secondary}]}>
          INTELLIGENT LEARNING EXPERIENCE
        </Text>
      </View>

      <TouchableOpacity
        style={styles.themeButton}
        onPress={onToggleTheme}>
        <Text style={styles.themeIcon}>
          {isDark ? '☀️' : '🌙'}
        </Text>
      </TouchableOpacity>
    </View>
  );
}

function App() {
  const [screen, setScreen] = useState('splash');
  const [isDark, setIsDark] = useState(true);
  const [isLogin, setIsLogin] = useState(true);

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [databaseReady, setDatabaseReady] = useState(false);
  const [tutorQuestion, setTutorQuestion] = useState('');
const [tutorAnswer, setTutorAnswer] = useState('');
const [tutorSources, setTutorSources] = useState<string[]>([]);
const [tutorLoading, setTutorLoading] = useState(false);
 useEffect(() => {
  const setupDatabase = async () => {
    try {
      await initializeDatabase();
      console.log('DATABASE READY');
      setDatabaseReady(true);
    } catch (error) {
      console.error('DATABASE SETUP FAILED:', error);
    }
  };

  setupDatabase();
}, []);

  // Splash screen animations
  const logoScale = useRef(new Animated.Value(0.3)).current;
  const logoOpacity = useRef(new Animated.Value(0)).current;
  const titleOpacity = useRef(new Animated.Value(0)).current;
  const titleTranslate = useRef(new Animated.Value(25)).current;
  const taglineOpacity = useRef(new Animated.Value(0)).current;
  const taglineTranslate = useRef(new Animated.Value(20)).current;
  const footerOpacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.sequence([
      Animated.parallel([
        Animated.spring(logoScale, {
          toValue: 1,
          friction: 5,
          tension: 55,
          useNativeDriver: true,
        }),
        Animated.timing(logoOpacity, {
          toValue: 1,
          duration: 900,
          useNativeDriver: true,
        }),
      ]),
      Animated.parallel([
        Animated.timing(titleOpacity, {
          toValue: 1,
          duration: 700,
          useNativeDriver: true,
        }),
        Animated.timing(titleTranslate, {
          toValue: 0,
          duration: 700,
          easing: Easing.out(Easing.ease),
          useNativeDriver: true,
        }),
      ]),
      Animated.parallel([
        Animated.timing(taglineOpacity, {
          toValue: 1,
          duration: 800,
          useNativeDriver: true,
        }),
        Animated.timing(taglineTranslate, {
          toValue: 0,
          duration: 800,
          useNativeDriver: true,
        }),
      ]),
      Animated.timing(footerOpacity, {
        toValue: 1,
        duration: 700,
        useNativeDriver: true,
      }),
    ]).start();

    const timer = setTimeout(() => {
      setScreen('auth');
    }, 5000);

    return () => clearTimeout(timer);
  }, []);

  const colors = {
    background: isDark ? '#10132B' : '#F4F3FC',
    card: isDark ? '#1B1F40' : '#FFFFFF',
    text: isDark ? '#FFFFFF' : '#191936',
    secondary: isDark ? '#B8BAD0' : '#666681',
    border: isDark ? '#30345B' : '#E4E0F2',
    input: isDark ? '#242849' : '#F5F3FC',
  };
const handleAuth = async () => {
  if (!email.trim() || !password.trim()) {
    Alert.alert(
      'Missing Information',
      'Please enter your email and password.',
    );
    return;
  }

  if (!email.includes('@')) {
    Alert.alert('Invalid Email', 'Please enter a valid email address.');
    return;
  }

  // CREATE ACCOUNT
  if (!isLogin) {
    if (!name.trim()) {
      Alert.alert('Missing Name', 'Please enter your full name.');
      return;
    }

    if (password.length < 6) {
      Alert.alert(
        'Weak Password',
        'Password must be at least 6 characters.',
      );
      return;
    }

    if (password !== confirmPassword) {
      Alert.alert('Password Error', 'Passwords do not match.');
      return;
    }

    const result = await registerUser(name, email, password);

    if (result.success) {
      Alert.alert('Success', result.message);

      setIsLogin(true);
      setPassword('');
      setConfirmPassword('');
      setName('');
    } else {
      Alert.alert('Registration Failed', result.message);
    }

    return;
  }

  // LOGIN
  const result = await loginUser(email, password);

 if (result.success) {
  setName(String(result.user?.full_name || ''));
  setPassword('');

  setScreen('home');

  Alert.alert('Welcome', result.message);
}
};
  const handleTutorAsk = async () => {
  if (!tutorQuestion.trim()) {
    Alert.alert('Empty Question', 'Please enter your question.');
    return;
  }

  try {
    setTutorLoading(true);
    setTutorAnswer('');
    setTutorSources([]);

    const result = await searchDocumentChunks(tutorQuestion);

    if (result.success && result.chunks.length > 0) {
      const answer = result.chunks
  .map(
    (chunk: any) =>
      `Source: ${chunk.file_name || 'Unknown Document'}\n\n${chunk.chunk_text}`,
  )
  .join('\n\n--------------------\n\n');

      setTutorAnswer(answer);
      const sources = [
  ...new Set(
    result.chunks
      .map((chunk: any) => chunk.file_name)
      .filter(Boolean),
  ),
];

setTutorSources(sources);
    } else {
      setTutorAnswer('No relevant information found in your documents.');
    }
  } catch (error) {
    console.error('TUTOR SEARCH ERROR:', error);
    Alert.alert('Error', 'Unable to search your documents.');
  } finally {
    setTutorLoading(false);
  }
};   

    
    
  

   

  // ORIGINAL SPLASH SCREEN
  if (screen === 'splash') {
    return (
      <View style={styles.splash}>
        <StatusBar barStyle="light-content" />

        <View style={styles.glowOne} />
        <View style={styles.glowTwo} />

        <View style={styles.logoContainer}>
          <Animated.View
            style={[
              styles.logoOuter,
              {
                opacity: logoOpacity,
                transform: [{scale: logoScale}],
              },
            ]}>
            <View style={styles.logoInner}>
              <Text style={styles.spark}>✦</Text>

              <View style={styles.book}>
                <View style={styles.bookPageLeft} />
                <View style={styles.bookPageRight} />
                <View style={styles.bookSpine} />
              </View>

              <View style={styles.nodeOne} />
              <View style={styles.nodeTwo} />
              <View style={styles.nodeThree} />
            </View>
          </Animated.View>

          <Animated.Text
            style={[
              styles.appName,
              {
                opacity: titleOpacity,
                transform: [{translateY: titleTranslate}],
              },
            ]}>
            Cognify <Text style={styles.aiText}>AI</Text>
          </Animated.Text>

          <Animated.Text
            style={[styles.subBrand, {opacity: titleOpacity}]}>
            INTELLIGENT LEARNING EXPERIENCE
          </Animated.Text>
        </View>

        <Animated.View
          style={[
            styles.textContainer,
            {
              opacity: taglineOpacity,
              transform: [{translateY: taglineTranslate}],
            },
          ]}>
          <Text style={styles.tagline}>
            Learn Smarter.{"\n"}
            Think Deeper.
          </Text>

          <Text style={styles.purpleText}>
            Grow Beyond Limits.
          </Text>

          <Text style={styles.description}>
            Your Personal AI-Powered Learning Companion
          </Text>
        </Animated.View>

        <Animated.View
          style={[styles.footerContainer, {opacity: footerOpacity}]}>
          <View style={styles.footerLine} />
          <Text style={styles.footer}>
            INTELLIGENCE MEETS LEARNING
          </Text>
        </Animated.View>
      </View>
    );
  }

  // LOGIN AND CREATE ACCOUNT
  if (screen === 'auth') {
    return (
      <View style={[styles.container, {backgroundColor: colors.background}]}>
        <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} />

        <ScrollView contentContainerStyle={styles.authScroll}>
          <BrandHeader
  colors={colors}
  isDark={isDark}
  onToggleTheme={() => setIsDark(!isDark)}
/>
          <View style={styles.authIntro}>
            <Text style={[styles.authTitle, {color: colors.text}]}>
              {isLogin ? 'Welcome Back!' : 'Create Account'}
            </Text>

            <Text
              style={[
                styles.authSubtitle,
                {color: colors.secondary},
              ]}>
              {isLogin
                ? 'Sign in to continue your learning journey.'
                : 'Join Cognify AI and start learning smarter.'}
            </Text>
          </View>

          <View
            style={[
              styles.authCard,
              {
                backgroundColor: colors.card,
                borderColor: colors.border,
              },
            ]}>
            {!isLogin && (
              <>
                <Text style={[styles.fieldLabel, {color: colors.text}]}>
                  Full Name
                </Text>

                <TextInput
                  style={[
                    styles.input,
                    {backgroundColor: colors.input, color: colors.text},
                  ]}
                  placeholder="Enter your full name"
                  placeholderTextColor={colors.secondary}
                  value={name}
                  onChangeText={setName}
                />
              </>
            )}

            <Text style={[styles.fieldLabel, {color: colors.text}]}>
              Email Address
            </Text>

            <TextInput
              style={[
                styles.input,
                {backgroundColor: colors.input, color: colors.text},
              ]}
              placeholder="Enter your email"
              placeholderTextColor={colors.secondary}
              keyboardType="email-address"
              autoCapitalize="none"
              value={email}
              onChangeText={setEmail}
            />

            <Text style={[styles.fieldLabel, {color: colors.text}]}>
              Password
            </Text>

            <TextInput
              style={[
                styles.input,
                {backgroundColor: colors.input, color: colors.text},
              ]}
              placeholder="Enter your password"
              placeholderTextColor={colors.secondary}
              secureTextEntry
              value={password}
              onChangeText={setPassword}
            />

            {!isLogin && (
              <>
                <Text style={[styles.fieldLabel, {color: colors.text}]}>
                  Confirm Password
                </Text>

                <TextInput
                  style={[
                    styles.input,
                    {backgroundColor: colors.input, color: colors.text},
                  ]}
                  placeholder="Confirm your password"
                  placeholderTextColor={colors.secondary}
                  secureTextEntry
                  value={confirmPassword}
                  onChangeText={setConfirmPassword}
                />
              </>
            )}

            <TouchableOpacity
              style={styles.primaryButton}
              onPress={handleAuth}>
              <Text style={styles.primaryButtonText}>
                {isLogin ? 'Login' : 'Create Account'}
              </Text>
            </TouchableOpacity>

            <View style={styles.switchRow}>
              <Text style={{color: colors.secondary}}>
                {isLogin
                  ? "Don't have an account? "
                  : 'Already have an account? '}
              </Text>

              <TouchableOpacity onPress={() => setIsLogin(!isLogin)}>
                <Text style={styles.switchText}>
                  {isLogin ? 'Sign Up' : 'Login'}
                </Text>
              </TouchableOpacity>
            </View>
          </View>

          <Text style={[styles.bottomText, {color: colors.secondary}]}>
            COGNIFY AI • LEARN WITHOUT LIMITS
          </Text>
        </ScrollView>
      </View>
    );
  }
 if (screen === 'upload') {
  if (!databaseReady) {
    return (
      <View style={styles.container}>
       <Text style={{color: '#FFFFFF', fontSize: 18}}>
  Preparing database...
</Text>
      </View>
    );
  }

  return (
    <DocumentUpload
  onBack={() => setScreen('home')}
  colors={colors}
  isDark={isDark}
  onToggleTheme={() => setIsDark(!isDark)}
/>
  );
}


// AI TUTOR SCREEN
if (screen === 'tutor') {
  return (
    <View style={[styles.container, {backgroundColor: colors.background}]}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} />
<View style={{paddingHorizontal: 22, paddingTop: 45}}>
  <BrandHeader
    colors={colors}
    isDark={isDark}
    onToggleTheme={() => setIsDark(!isDark)}
  />
</View>
      <Text style={{color: colors.text, fontSize: 26, margin: 20}}>
        🤖 AI Tutor
      </Text>
      <Text
  style={{
    color: colors.secondary,
    fontSize: 14,
    marginHorizontal: 20,
    marginTop: -12,
    marginBottom: 20,
    lineHeight: 21,
  }}>
  Ask questions and explore information from your uploaded documents.
</Text>

      <TextInput
       style={{
  backgroundColor: colors.input,
  color: colors.text,
  marginHorizontal: 20,
  padding: 15,
  borderRadius: 12,
  minHeight: 100,
  borderWidth: 1,
  borderColor: colors.border,
  fontSize: 15,
  textAlignVertical: 'top',
  marginBottom: 12,
}}
        placeholder="Ask a question about your documents..."
        placeholderTextColor={colors.secondary}
        value={tutorQuestion}
        onChangeText={setTutorQuestion}
        multiline
      />

      <TouchableOpacity
        style={[
  styles.primaryButton,
  {
    marginHorizontal: 20,
    opacity: tutorLoading || !tutorQuestion.trim() ? 0.5 : 1,
  },
]}
        onPress={handleTutorAsk}
        disabled={tutorLoading || !tutorQuestion.trim()}>
        {tutorLoading ? (
  <View style={{flexDirection: 'row', alignItems: 'center'}}>
    <ActivityIndicator size="small" color="#FFFFFF" />
    <Text style={[styles.primaryButtonText, {marginLeft: 10}]}>
      Searching...
    </Text>
  </View>
) : (
  <Text style={styles.primaryButtonText}>
    Ask Question
  </Text>
)}
      </TouchableOpacity>
      <TouchableOpacity
  style={[styles.primaryButton, {marginHorizontal: 20, marginTop: 10}]}
  disabled={tutorLoading}
  onPress={() => {
    setTutorQuestion('');
    setTutorAnswer('');
    setTutorSources([]);
  }}>
  <Text style={styles.primaryButtonText}>
    Clear
  </Text>
</TouchableOpacity>

      <ScrollView
  style={{margin: 20}}
  contentContainerStyle={{paddingBottom: 20}}
  keyboardShouldPersistTaps="handled">
        <View
  style={{
    backgroundColor: colors.card,
    padding: 15,
    borderRadius: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: colors.border,
  }}>
  <Text
    style={{
      color: colors.text,
      fontSize: 18,
      fontWeight: 'bold',
    }}>
    Relevant Information from Your Documents:
  </Text>
</View>

        <View
  style={{
    backgroundColor: colors.card,
    padding: 16,
    borderRadius: 12,
    marginTop: 10,
    marginBottom: 15,
    borderWidth: 1,
    borderColor: colors.border,
  }}>
  <Text
    style={{
      color: colors.text,
      fontSize: 15,
      lineHeight: 25,
    }}>
    {tutorLoading
  ? 'Please wait while we search your documents...'
  : tutorAnswer || '👋 Welcome to AI Tutor!\n\nEnter a question about your uploaded documents and tap Ask Question to get started.'}
  </Text>
</View>
       {tutorSources.length > 0 && (
  <View
    style={{
      backgroundColor: colors.card,
      padding: 16,
      borderRadius: 12,
      marginTop: 10,
      marginBottom: 15,
      borderWidth: 1,
      borderColor: colors.border,
    }}>
    <Text
      style={{
        color: colors.text,
        fontSize: 18,
        fontWeight: 'bold',
        marginBottom: 12,
      }}>
      📚 Source Documents
    </Text>

    {tutorSources.map((source, index) => (
      <View
        key={index}
        style={{
          padding: 12,
          backgroundColor: colors.input,
          borderRadius: 8,
          marginTop: 8,
        }}>
        <Text style={{color: colors.text, fontSize: 14}}>
          {index + 1}. {source}
        </Text>
      </View>
    ))}
  </View>
)}
      </ScrollView>

     <TouchableOpacity
  style={styles.backHomeButton}
  onPress={() => setScreen('home')}>
  <Text style={styles.backArrow}>‹</Text>
  <Text style={styles.backHomeText}>Back to Home</Text>
</TouchableOpacity>
    </View>
  );
}

// FLASHCARD REVIEW SCREEN
if (screen === 'flashcards') {
  return (
    <FlashcardReview
      onBack={() => setScreen('home')}
      colors={colors}
      isDark={isDark}
      onToggleTheme={() => setIsDark(!isDark)}
    />
  );
}
// SMART ASSESSMENT SCREEN
if (screen === 'assessment') {
  return (
    <SmartAssessment
      onBack={() => setScreen('home')}
      colors={colors}
      isDark={isDark}
      onToggleTheme={() => setIsDark(!isDark)}
    />
  );
}
// LEARNING COACH SCREEN
if (screen === 'coach') {
  return (
    <LearningCoach
      onBack={() => setScreen('home')}
      colors={colors}
      isDark={isDark}
      onToggleTheme={() => setIsDark(!isDark)}
    />
  );
}
// HOME SCREEN
  return (
    <View style={[styles.container, {backgroundColor: colors.background}]}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} />

      <ScrollView contentContainerStyle={styles.homeScroll}>
        <BrandHeader
          colors={colors}
          isDark={isDark}
          onToggleTheme={() => setIsDark(!isDark)}
        />

        <View style={styles.hero}>
          <Text style={styles.welcome}>WELCOME TO COGNIFY AI</Text>

          <Text style={styles.heroTitle}>
            Learn Smarter.{"\n"}
            <Text style={styles.aiText}>Grow Further.</Text>
          </Text>

          <Text style={styles.heroDescription}>
            Your knowledge, organized. Your learning, personalized.
          </Text>

          <TouchableOpacity
  style={styles.primaryButton}
  onPress={() => setScreen('upload')}>
            <Text style={styles.primaryButtonText}>
              + Upload Document
            </Text>
          </TouchableOpacity>
        </View>

        <Text style={[styles.sectionTitle, {color: colors.text}]}>
          Explore Features
        </Text>

        {[
  ['📚', 'Document Intelligence', 'Upload and understand study documents.'],
  ['🤖', 'AI Tutor', 'Ask questions and learn with AI.'],
  ['📝', 'Smart Assessment', 'Test your knowledge with quizzes.'],
  ['🎯', 'Learning Coach', 'Track your learning progress.'],
  ['🗂️', 'Flashcard Review', 'Revise important concepts with flashcards.'],
].map((item, index) => (
          <View
            key={index}
            style={[
              styles.featureCard,
              {
                backgroundColor: colors.card,
                borderColor: colors.border,
              },
            ]}>
            <Text style={styles.featureIcon}>{item[0]}</Text>

            <Text style={[styles.featureTitle, {color: colors.text}]}>
              {item[1]}
            </Text>

            <View style={styles.featureBottomRow}>
              <Text
                style={[
                  styles.featureDescription,
                  {color: colors.secondary},
                ]}>
                {item[2]}
              </Text>

              <TouchableOpacity
                style={styles.exploreButton}
                onPress={() => {
  const screens = ['upload', 'tutor', 'assessment', 'coach', 'flashcards'];
  setScreen(screens[index]);
}}
                >
                <View style={styles.exploreButtonContent}>
                 <Text style={styles.exploreButtonText}>Explore</Text>
                     <Text style={styles.exploreArrow}>➡</Text>
                  </View>
              </TouchableOpacity>
            </View>
          </View>
        ))}

        <TouchableOpacity
          style={styles.logoutButton}
          onPress={() => {
            setScreen('auth');
            setIsLogin(true);
            setPassword('');
          }}>
          <Text style={styles.logoutText}>Logout</Text>
        </TouchableOpacity>

      </ScrollView>
    </View>
  );
}


const styles = StyleSheet.create({
  // SPLASH SCREEN STYLES
  splash: {
    flex: 1,
    backgroundColor: '#10132B',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 65,
    overflow: 'hidden',
  },
  glowOne: {
    position: 'absolute',
    width: 240,
    height: 240,
    borderRadius: 120,
    backgroundColor: '#35236E',
    opacity: 0.28,
    top: 100,
    alignSelf: 'center',
  },
  glowTwo: {
    position: 'absolute',
    width: 200,
    height: 200,
    borderRadius: 100,
    backgroundColor: '#252A68',
    opacity: 0.2,
    bottom: 120,
    alignSelf: 'center',
  },
  logoContainer: {
    alignItems: 'center',
    marginTop: 75,
  },
  logoOuter: {
    width: 130,
    height: 130,
    borderRadius: 38,
    backgroundColor: '#7856E8',
    padding: 3,
    shadowColor: '#A78BFA',
    shadowOpacity: 0.55,
    shadowRadius: 22,
    elevation: 14,
  },
  logoInner: {
    flex: 1,
    borderRadius: 35,
    backgroundColor: '#191A3D',
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  spark: {
    position: 'absolute',
    top: 16,
    right: 25,
    color: '#D7C7FF',
    fontSize: 27,
  },
  book: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 18,
  },
  bookPageLeft: {
    width: 32,
    height: 38,
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 6,
    borderBottomLeftRadius: 6,
    transform: [{skewY: '-8deg'}],
    borderRightWidth: 1,
    borderRightColor: '#A78BFA',
  },
  bookPageRight: {
    width: 32,
    height: 38,
    backgroundColor: '#C4B5FD',
    borderTopRightRadius: 6,
    borderBottomRightRadius: 6,
    transform: [{skewY: '8deg'}],
  },
  bookSpine: {
    position: 'absolute',
    width: 2,
    height: 40,
    backgroundColor: '#7856E8',
    alignSelf: 'center',
  },
  nodeOne: {
    position: 'absolute',
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: '#D7C7FF',
    top: 27,
    left: 24,
  },
  nodeTwo: {
    position: 'absolute',
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#A78BFA',
    bottom: 25,
    right: 25,
  },
  nodeThree: {
    position: 'absolute',
    width: 5,
    height: 5,
    borderRadius: 3,
    backgroundColor: '#FFFFFF',
    bottom: 23,
    left: 25,
  },
  appName: {
    color: '#FFFFFF',
    fontSize: 35,
    fontWeight: 'bold',
    marginTop: 25,
    letterSpacing: 0.5,
  },
  aiText: {
    color: '#A78BFA',
  },
  subBrand: {
    color: '#9295B5',
    fontSize: 9,
    letterSpacing: 2,
    marginTop: 10,
  },
  textContainer: {
    alignItems: 'center',
    paddingHorizontal: 22,
  },
  tagline: {
    color: '#FFFFFF',
    fontSize: 29,
    fontWeight: 'bold',
    textAlign: 'center',
    lineHeight: 43,
  },
  purpleText: {
    color: '#A78BFA',
    fontSize: 25,
    fontWeight: 'bold',
    marginTop: 5,
  },
  description: {
    color: '#B8BAD0',
    fontSize: 13,
    textAlign: 'center',
    marginTop: 22,
  },
  footerContainer: {
    alignItems: 'center',
  },
  footerLine: {
    width: 38,
    height: 3,
    borderRadius: 5,
    backgroundColor: '#7856E8',
    marginBottom: 14,
  },
  footer: {
    color: '#8589AA',
    fontSize: 9,
    letterSpacing: 2,
  },

  // AUTH AND HOME STYLES
  brandHeader: {
  flexDirection: 'row',
  alignItems: 'center',
  padding: 15,
  borderRadius: 18,
  borderWidth: 1,
  marginBottom: 30,
},
brandLogo: {
  width: 46,
  height: 46,
  borderRadius: 14,
  backgroundColor: '#7856E8',
  alignItems: 'center',
  justifyContent: 'center',
},
brandLogoText: {
  color: '#FFFFFF',
  fontSize: 27,
},
brandInfo: {
  flex: 1,
  marginLeft: 12,
},
brandName: {
  fontSize: 21,
  fontWeight: 'bold',
},
brandTagline: {
  fontSize: 8,
  letterSpacing: 1,
  marginTop: 4,
},
  container: {flex: 1},
  authScroll: {padding: 22, paddingTop: 45, flexGrow: 1},
  homeScroll: {padding: 22, paddingTop: 45, paddingBottom: 35},
  authHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 35,
  },
  brand: {fontSize: 25, fontWeight: 'bold'},
  headerSubtitle: {fontSize: 8, letterSpacing: 1.5, marginTop: 5},
  themeButton: {
    width: 46,
    height: 46,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
  },
  themeIcon: {fontSize: 22},
  authIntro: {marginBottom: 25},
  authTitle: {fontSize: 29, fontWeight: 'bold'},
  authSubtitle: {fontSize: 13, marginTop: 9, lineHeight: 20},
  authCard: {
    borderWidth: 1,
    borderRadius: 22,
    padding: 20,
  },
  fieldLabel: {
    fontSize: 13,
    fontWeight: '600',
    marginBottom: 9,
    marginTop: 15,
  },
  input: {
    height: 52,
    borderRadius: 12,
    paddingHorizontal: 14,
    fontSize: 14,
  },
  primaryButton: {
    backgroundColor: '#7856E8',
    padding: 16,
    borderRadius: 13,
    alignItems: 'center',
    marginTop: 25,
  },
  primaryButtonText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: 'bold',
  },
  switchRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginTop: 23,
    flexWrap: 'wrap',
  },
  switchText: {color: '#A78BFA', fontWeight: 'bold'},
  bottomText: {
    textAlign: 'center',
    fontSize: 9,
    letterSpacing: 1,
    marginTop: 30,
  },
  hero: {
    backgroundColor: '#24204D',
    borderRadius: 25,
    padding: 23,
    marginBottom: 30,
  },
  welcome: {color: '#C4B5FD', fontSize: 10, letterSpacing: 1.5},
  heroTitle: {
    color: '#FFFFFF',
    fontSize: 32,
    fontWeight: 'bold',
    lineHeight: 42,
    marginTop: 18,
  },
  heroDescription: {
    color: '#D0C9E8',
    fontSize: 13,
    lineHeight: 21,
    marginTop: 12,
  },
  sectionTitle: {fontSize: 22, fontWeight: 'bold', marginBottom: 18},
  featureCard: {
    borderWidth: 1,
    borderRadius: 19,
    padding: 19,
    marginBottom: 15,
  },
  featureIcon: {fontSize: 27, marginBottom: 12},
  featureTitle: {fontSize: 17, fontWeight: 'bold'},
  featureDescription: {
  fontSize: 12,
  lineHeight: 19,
  marginTop: 7,
  flex: 1,
  marginRight: 8,
},

featureBottomRow: {
  flexDirection: 'row',
  alignItems: 'center',
  justifyContent: 'space-between',
  marginTop: 7,
},

exploreButton: {
  backgroundColor: '#7856E8',
  paddingHorizontal: 12,
  paddingVertical: 8,
  borderRadius: 9,
  alignItems: 'center',
  justifyContent: 'center',
},

exploreButtonText: {
  color: '#FFFFFF',
  fontSize: 11,
  fontWeight: 'bold',
},
exploreButtonContent: {
  flexDirection: 'row',
  alignItems: 'center',
  gap: 6,
},

exploreArrow: {
  color: '#FFFFFF',
  fontSize: 13,
},

logoutButton: {
  alignSelf: 'flex-start',
  backgroundColor: '#7856E8',
  borderRadius: 12,
  paddingHorizontal: 20,
  paddingVertical: 12,
  marginTop: 5,
},

logoutText: {
  color: '#FFFFFF',
  fontSize: 14,
  fontWeight: 'bold',
},
backHomeButton: {
  alignSelf: 'center',
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

});

export default App;

