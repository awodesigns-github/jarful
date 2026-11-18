# Jarful

A gratitude jar for your phone.

Each day, write a short note about something good, tap **Drop it in**, and watch it fold up and fall into your jar. Over time the jar fills. On a hard day, shake your phone or tap the jar to pull out a random note from the past.

Jarful is built to help you end the day feeling that something went right, with no effort and no guilt. There are no streaks, no missed-day counts and no red warnings.

> **Status:** early development. Android comes first; iOS will follow.

## What it does

- **Write a note:** one field, up to 140 characters, with an optional mood colour.
- **The jar:** home is a single screen where your jar visibly fills with folded notes.
- **Drop-in:** the note folds and falls in, the jar reacts, and you feel a light haptic tap.
- **Remember:** shake, or tap the jar, to reveal a random past note. Favourite the ones you love.
- **Daily reminder:** one optional, gentle notification at a time you choose.
- **Archive:** every note by month, newest first, with your favourites.
- **New jars:** a jar seals at 30 notes and moves to your shelf, and a fresh one starts.
- **Private by default:** start without an account. Sign in (Google or email) only if you want backup and restore, and delete everything from settings at any time.

No third-party analytics or tracking.

## Design

Soft, warm and calm. The jar is where the delight lives; everything around it stays quiet. Motion feels physical and gentle, and **reduced motion** swaps movement for short fades. Jarful aims for WCAG AA contrast, 48 dp tap targets, one-thumb reach and full TalkBack support.

Type: [Shantell Sans](https://fonts.google.com/specimen/Shantell+Sans) for the wordmark and big moments, [DM Sans](https://fonts.google.com/specimen/DM+Sans) for everything else.

## Built with

- [Expo](https://expo.dev) and React Native, TypeScript, Expo Router
- Reanimated, Gesture Handler and react-native-svg for the jar and its motion
- expo-haptics, expo-sensors (shake) and expo-notifications (local reminders)
- [Convex](https://convex.dev) for the backend, with Convex Auth (anonymous first, optional sign-in)
- Jest with React Native Testing Library, convex-test, and Maestro for end-to-end tests
- EAS Build and Submit for Google Play

## Getting started

You need Node 22, an [Expo](https://expo.dev) account and a [Convex](https://convex.dev) account. To run on an emulator, you also need the Android SDK.

```sh
npm install
npx convex dev          # creates your Convex dev deployment and writes .env.local
```

Build a development client once, then start the dev server:

```sh
npx eas-cli build --profile development --platform android   # cloud build, install the APK
npm start
```

Or build locally with `npm run android`.

## Tests

```sh
npm run typecheck
npm test               # app tests (Jest + React Native Testing Library)
npm run test:convex    # backend tests (convex-test + Vitest)
```

End-to-end flows live in `e2e/` and run locally with [Maestro](https://maestro.dev): `maestro test e2e/`.

CI runs the typecheck and both test suites on every pull request.

## Project layout

```
app/          screens (Expo Router)
components/   UI components
theme/        design tokens, fonts and light/dark theme
convex/       backend schema and functions
lib/data/     typed hooks the UI uses to read and write data
tests/        Jest and convex-test suites
e2e/          Maestro flows
docs/         plan, user stories, decisions and QA notes
```

## Contributing

The project uses git flow. Branch from `develop` with `feature/<name>`, open a pull request into `develop`, and merge once CI is green. `main` holds released code only.
