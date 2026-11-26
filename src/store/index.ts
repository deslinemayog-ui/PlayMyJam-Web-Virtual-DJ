import { combineReducers, configureStore } from '@reduxjs/toolkit';
import { persistStore, persistReducer } from 'redux-persist';
import storage from './electronStorage';
import accountSlice from './slices/accountInfo';
import musicPlayerSlice from './slices/musicPlayerSlice';
import globalVariables from './slices/globalVariables';

// Music player persist config - exclude large song catalog, live playback ticks, and transient states
const musicPlayerPersistConfig = {
  key: 'musicPlayer',
  storage,
  blacklist: ['djSongs', 'deckA', 'deckB', 'isLoadingSongs', 'isRecording', 'recordingDuration'],
  transforms: [
    {
      in: (inboundState: any, key: string) => {
        if ((key === 'deckA' || key === 'deckB') && inboundState && typeof inboundState === 'object') {
          return {
            ...inboundState,
            isLoading: false,
            isPlaying: false,
            position: 0,
          };
        }
        return inboundState;
      },
      out: (outboundState: any, key: string) => {
        // Recover cleanly if a previous session persisted a corrupted non-numeric volume/crossfader
        if (key === 'masterVolume' && (typeof outboundState !== 'number' || !Number.isFinite(outboundState))) {
          return 75;
        }
        if (key === 'crossfader' && (typeof outboundState !== 'number' || !Number.isFinite(outboundState))) {
          return 50;
        }
        if ((key === 'deckA' || key === 'deckB') && outboundState && typeof outboundState === 'object') {
          return {
            ...outboundState,
            volume: typeof outboundState.volume === 'number' && Number.isFinite(outboundState.volume) ? outboundState.volume : 75,
            isLoading: false,
            isPlaying: false,
            position: 0,
          };
        }
        return outboundState;
      },
    }
  ],
};

const rootReducer = combineReducers({
  accountSlice,
  globalVariables,
  musicPlayer: persistReducer(musicPlayerPersistConfig, musicPlayerSlice)
});

const persistConfig = {
  key: 'root',
  storage,
  whitelist: ['accountSlice', 'globalVariables'],
  blacklist: ['modalData', 'modalState', 'camera', 'ConfirmDialog', 'game'],
};

const persistedReducer = persistReducer(persistConfig, rootReducer);

export const store = configureStore({
  reducer: persistedReducer,
  middleware: getDefaultMiddleware =>
    getDefaultMiddleware({
      immutableCheck: false,
      serializableCheck: false,
    }),
});

// Define the state structure with all slices
export interface RootStateWithoutPersist {
  accountSlice: ReturnType<typeof accountSlice>;
  musicPlayer: ReturnType<typeof musicPlayerSlice>;
  globalVariables: ReturnType<typeof globalVariables>;
}

// Define the persisted state type
export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;
export const persistor = persistStore(store);