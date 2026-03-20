
import React, { createContext, useContext, useMemo } from 'react';
import { useScreenSize, ScreenSize } from '../hooks/useScreenSize';

export type ContentDensity = 'compact' | 'normal' | 'relaxed';

interface ContentDensityContextType {
  density: ContentDensity;
  isMobile: boolean;
  isTablet: boolean;
  isDesktop: boolean;
  size: ScreenSize;
  orientation: 'portrait' | 'landscape';
  isLandscape: boolean;
  isPortrait: boolean;
}

const ContentDensityContext = createContext<ContentDensityContextType | undefined>(undefined);

export const ContentDensityProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { width, height, isMobile, isTablet, isDesktop, size, orientation, isLandscape, isPortrait } = useScreenSize();

  const density = useMemo((): ContentDensity => {
    // Automatically detect optimal density based on screen height and width
    // Compact for small heights or small widths
    if (height < 650 || width < 640) return 'compact';
    // Relaxed for large screens with plenty of vertical space
    if (height > 900 && width > 1280) return 'relaxed';
    // Default to normal
    return 'normal';
  }, [width, height]);

  const value = useMemo(() => ({
    density,
    isMobile,
    isTablet,
    isDesktop,
    size,
    orientation,
    isLandscape,
    isPortrait
  }), [density, isMobile, isTablet, isDesktop, size, orientation, isLandscape, isPortrait]);

  return (
    <ContentDensityContext.Provider value={value}>
      {children}
    </ContentDensityContext.Provider>
  );
};

export const useContentDensity = () => {
  const context = useContext(ContentDensityContext);
  if (context === undefined) {
    throw new Error('useContentDensity must be used within a ContentDensityProvider');
  }
  return context;
};
