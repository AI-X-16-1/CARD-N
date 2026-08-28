import type { LinkingOptions } from '@react-navigation/native';

import type { RootStackParamList } from './RootNavigator';

/**
 * Deep links into the app.
 *
 * The only producer today is the incoming-call notification, which is built in Kotlin
 * (`modules/call-detector/.../IncomingCallReceiver.kt`) and fires
 * `cardn://person/{id}`. That receiver runs when the app's process is gone, so this has
 * to work from a cold start, not just while the app is foregrounded.
 *
 * Routed through 홈 because it is the default tab: backing out of the person lands
 * somewhere sensible rather than in the middle of the graph.
 *
 * The scheme is declared in app.json (`expo.scheme`) and only reaches the app after a
 * prebuild — note this is NOT the `exp+cardn://` scheme the Expo dev client uses for its
 * own launcher.
 */
export const linking: LinkingOptions<RootStackParamList> = {
  prefixes: ['cardn://'],
  config: {
    screens: {
      Tabs: {
        screens: {
          홈: {
            screens: {
              PersonDetail: {
                path: 'person/:personId',
                // URL segments arrive as strings; PersonDetail's param is a number.
                parse: { personId: Number },
              },
            },
          },
        },
      },
    },
  },
};
