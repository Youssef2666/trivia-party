/**
 * TriviaI18n — Internationalization module
 * Handles Arabic/English translations with RTL/LTR support.
 * Loads translation JSON files and provides a t() function for lookups.
 */
(function () {
  'use strict';

  var TriviaI18n = {
    currentLang: 'ar',
    translations: {},

    /**
     * Initialize i18n: fetch both language files, restore saved preference.
     */
    init: async function () {
      try {
        var arRes = await fetch('/lang/ar.json');
        var enRes = await fetch('/lang/en.json');

        if (!arRes.ok || !enRes.ok) {
          throw new Error('Failed to load translation files');
        }

        this.translations.ar = await arRes.json();
        this.translations.en = await enRes.json();
      } catch (err) {
        console.error('[i18n] Failed to load translations:', err);
        // Provide empty fallbacks so the app doesn't crash
        this.translations.ar = this.translations.ar || {};
        this.translations.en = this.translations.en || {};
      }

      // Restore saved language preference or default to Arabic
      var saved = localStorage.getItem('trivia_lang');
      this.currentLang = (saved === 'ar' || saved === 'en') ? saved : 'ar';

      this._applyDocumentAttributes();
    },

    /**
     * Translate a key using dot notation (e.g. 'home.title').
     * Falls back to the key string itself if not found.
     */
    t: function (key) {
      var parts = key.split('.');
      var obj = this.translations[this.currentLang];

      if (!obj) return key;

      for (var i = 0; i < parts.length; i++) {
        obj = obj[parts[i]];
        if (obj === undefined || obj === null) return key;
      }

      return obj;
    },

    /**
     * Switch language, persist choice, update document attributes,
     * and notify the app to re-render.
     */
    setLang: function (lang) {
      if (lang !== 'ar' && lang !== 'en') return;
      if (lang === this.currentLang) return;

      this.currentLang = lang;
      localStorage.setItem('trivia_lang', lang);
      this._applyDocumentAttributes();

      // Notify app of language change so it can re-render
      if (window.TriviaApp && typeof window.TriviaApp.onLanguageChange === 'function') {
        window.TriviaApp.onLanguageChange();
      }
    },

    /**
     * Get the current language code.
     */
    getLang: function () {
      return this.currentLang;
    },

    /**
     * Check if current language is RTL.
     */
    isRTL: function () {
      return this.currentLang === 'ar';
    },

    /**
     * Apply dir and lang attributes to the <html> element.
     */
    _applyDocumentAttributes: function () {
      var html = document.documentElement;
      html.setAttribute('lang', this.currentLang);
      html.setAttribute('dir', this.currentLang === 'ar' ? 'rtl' : 'ltr');
    }
  };

  window.TriviaI18n = TriviaI18n;
})();
