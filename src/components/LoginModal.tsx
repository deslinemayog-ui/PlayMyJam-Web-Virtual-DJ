import React, { useState, useRef, useEffect } from 'react';
import { X, Eye, EyeOff, Phone, Lock, LogIn, Loader2, ChevronDown, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/contexts/AuthContext';
import { countries, Country } from '@/constants/countries';
import { phoneNoValidation } from '@/utils';

const LoginModal = () => {
  const { showLoginModal, isLoading, error, login, closeLoginModal, clearError } = useAuth();

  // Country selection (defaulting to South Africa +27)
  const defaultCountry = countries.find((c) => c.dialCode === "+27") || countries[0];
  const [selectedCountry, setSelectedCountry] = useState<Country>(defaultCountry);
  const [showCountryPicker, setShowCountryPicker] = useState(false);
  const [countrySearch, setCountrySearch] = useState('');
  const dropdownRef = useRef<HTMLDivElement>(null);

  const [phoneNumber, setPhoneNumber] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [formErrors, setFormErrors] = useState<{ phoneNumber?: string; password?: string }>({});

  // Close country dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setShowCountryPicker(false);
      }
    };
    if (showCountryPicker) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [showCountryPicker]);

  const filteredCountries = countries.filter(
    (c) =>
      c.name.toLowerCase().includes(countrySearch.toLowerCase()) ||
      c.dialCode.includes(countrySearch)
  );

  const validateForm = () => {
    const errors: { phoneNumber?: string; password?: string } = {};

    if (!phoneNumber.trim()) {
      errors.phoneNumber = 'Phone number is required';
    } else {
      const validatedPhone = phoneNoValidation(phoneNumber, selectedCountry.dialCode);
      if (!validatedPhone) {
        errors.phoneNumber = `Please enter a valid phone number for ${selectedCountry.name}`;
      }
    }

    if (!password.trim()) {
      errors.password = 'Password is required';
    } else if (password.length < 6) {
      errors.password = 'Password must be at least 6 characters';
    }

    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!validateForm()) {
      return;
    }

    const validatedPhone = phoneNoValidation(phoneNumber, selectedCountry.dialCode);
    if (!validatedPhone) {
      setFormErrors({ phoneNumber: `Please enter a valid phone number for ${selectedCountry.name}` });
      return;
    }

    clearError();
    await login(validatedPhone, password);
  };

  const handleClose = () => {
    closeLoginModal();
    setPhoneNumber('');
    setPassword('');
    setShowCountryPicker(false);
    setCountrySearch('');
    setFormErrors({});
    clearError();
  };

  if (!showLoginModal) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={handleClose}
      />

      {/* Modal */}
      <div className="relative z-10 w-full max-w-md mx-4">
        <div className="glass-card p-8 animate-fade-in-up">
          {/* Header */}
          <div className="flex items-center justify-between mb-6">
            <div>
              <h2 className="text-2xl font-playfair font-bold text-white">
                Welcome to <span className="neon-text">PlayMyJam</span>
              </h2>
              <p className="text-gray-300 text-sm mt-1">Sign in to your account</p>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleClose}
              className="text-gray-400 hover:text-white hover:bg-white/10"
            >
              <X className="w-5 h-5" />
            </Button>
          </div>

          {/* Error Message */}
          {error && (
            <div className="mb-4 p-3 bg-red-500/20 border border-red-500/30 rounded-lg">
              <p className="text-red-400 text-sm">{error}</p>
            </div>
          )}

          {/* Login Form */}
          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Country & Dial Code Selector */}
            <div className="relative" ref={dropdownRef}>
              <label className="block text-white text-sm font-medium mb-2">
                Country & Dial Code
              </label>
              <button
                type="button"
                onClick={() => setShowCountryPicker(!showCountryPicker)}
                className="w-full flex items-center justify-between px-3.5 py-2.5 bg-white/5 border border-white/10 rounded-lg text-white hover:border-purple-400/50 hover:bg-white/10 transition-colors focus:outline-none focus:ring-2 focus:ring-purple-400/50"
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <img
                    src={selectedCountry?.flag}
                    alt={selectedCountry?.name}
                    className="w-6 h-4 object-cover rounded-sm shadow-sm flex-shrink-0"
                    onError={(e) => {
                      (e.target as HTMLElement).style.display = 'none';
                    }}
                  />
                  <span className="font-semibold text-purple-400 flex-shrink-0">
                    {selectedCountry?.dialCode}
                  </span>
                  <span className="text-gray-300 text-sm truncate">
                    {selectedCountry?.name}
                  </span>
                </div>
                <ChevronDown className={`w-4 h-4 text-gray-400 transition-transform flex-shrink-0 ml-2 ${showCountryPicker ? 'rotate-180' : ''}`} />
              </button>

              {/* Country dropdown list */}
              {showCountryPicker && (
                <div className="absolute top-[calc(100%+6px)] left-0 right-0 bg-[#161a29] border border-white/15 rounded-xl z-50 max-h-60 overflow-hidden shadow-2xl flex flex-col backdrop-blur-md">
                  <div className="p-2 border-b border-white/10 sticky top-0 bg-[#161a29]">
                    <div className="relative flex items-center">
                      <Search className="w-4 h-4 text-gray-400 absolute left-2.5 pointer-events-none" />
                      <input
                        type="text"
                        placeholder="Search country or code..."
                        value={countrySearch}
                        onChange={(e) => setCountrySearch(e.target.value)}
                        className="w-full pl-8 pr-3 py-1.5 bg-black/40 border border-white/10 rounded-lg text-white text-xs placeholder-gray-400 focus:outline-none focus:border-purple-400"
                        autoFocus
                      />
                    </div>
                  </div>
                  <div className="overflow-y-auto max-h-48 p-1.5 space-y-0.5">
                    {filteredCountries.slice(0, 50).map((c) => {
                      const isSelected = selectedCountry?.name === c.name;
                      return (
                        <button
                          key={`${c.isoCode}-${c.dialCode}`}
                          type="button"
                          onClick={() => {
                            setSelectedCountry(c);
                            setShowCountryPicker(false);
                            setCountrySearch('');
                          }}
                          className={`w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-left text-xs transition-colors ${isSelected
                              ? 'bg-purple-500/20 text-white font-medium'
                              : 'text-gray-300 hover:bg-white/10 hover:text-white'
                            }`}
                        >
                          <img
                            src={c.flag}
                            alt={c.name}
                            className="w-5 h-3.5 object-cover rounded-sm flex-shrink-0"
                            loading="lazy"
                          />
                          <span className="font-semibold text-purple-400 w-12 flex-shrink-0">
                            {c.dialCode}
                          </span>
                          <span className="truncate flex-1">
                            {c.name}
                          </span>
                        </button>
                      );
                    })}
                    {filteredCountries.length === 0 && (
                      <p className="text-gray-400 text-xs text-center py-4">No countries found</p>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Phone Number Field */}
            <div>
              <label className="block text-white text-sm font-medium mb-2">
                Phone Number
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <Phone className="h-5 w-5 text-gray-400" />
                </div>
                <input
                  type="tel"
                  value={phoneNumber}
                  onChange={(e) => {
                    setPhoneNumber(e.target.value);
                    if (formErrors.phoneNumber) {
                      setFormErrors(prev => ({ ...prev, phoneNumber: undefined }));
                    }
                  }}
                  className={`w-full pl-10 pr-4 py-3 bg-white/5 border rounded-lg text-white placeholder-gray-400 focus:outline-none focus:ring-2 transition-colors ${formErrors.phoneNumber
                      ? 'border-red-500 focus:ring-red-500/50'
                      : 'border-white/10 focus:border-purple-400 focus:ring-purple-400/50'
                    }`}
                  placeholder="e.g. 71 234 5678"
                  disabled={isLoading}
                />
              </div>
              {formErrors.phoneNumber && (
                <p className="text-red-400 text-xs mt-1">{formErrors.phoneNumber}</p>
              )}
            </div>

            {/* Password Field */}
            <div>
              <label className="block text-white text-sm font-medium mb-2">
                Password
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <Lock className="h-5 w-5 text-gray-400" />
                </div>
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value);
                    if (formErrors.password) {
                      setFormErrors(prev => ({ ...prev, password: undefined }));
                    }
                  }}
                  className={`w-full pl-10 pr-12 py-3 bg-white/5 border rounded-lg text-white placeholder-gray-400 focus:outline-none focus:ring-2 transition-colors ${formErrors.password
                      ? 'border-red-500 focus:ring-red-500/50'
                      : 'border-white/10 focus:border-purple-400 focus:ring-purple-400/50'
                    }`}
                  placeholder="Enter your password"
                  disabled={isLoading}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute inset-y-0 right-0 pr-3 flex items-center text-gray-400 hover:text-white transition-colors"
                  disabled={isLoading}
                >
                  {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                </button>
              </div>
              {formErrors.password && (
                <p className="text-red-400 text-xs mt-1">{formErrors.password}</p>
              )}
            </div>

            {/* Submit Button */}
            <Button
              type="submit"
              disabled={isLoading}
              className="w-full bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600 text-white font-semibold py-3 rounded-lg transition-all duration-200 hover-lift"
            >
              {isLoading ? (
                <>
                  <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                  Signing In...
                </>
              ) : (
                <>
                  <LogIn className="w-5 h-5 mr-2" />
                  Sign In
                </>
              )}
            </Button>
          </form>

          {/* Footer */}
          <div className="mt-6 text-center">
            <p className="text-gray-400 text-sm">
              Don't have an account?{' '}
              <button onClick={() => {
                window.location.href = 'https://playmyjam.empirelabs.digital/'
              }} className="text-purple-400 hover:text-purple-300 font-medium transition-colors">
                Sign up on the app
              </button>
            </p>
          </div>


        </div>
      </div>
    </div>
  );
};

export default LoginModal;
