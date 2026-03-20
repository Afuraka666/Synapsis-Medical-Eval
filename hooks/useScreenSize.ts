
import { useState, useEffect } from 'react';

export type ScreenSize = 'xs' | 'sm' | 'md' | 'lg' | 'xl' | '2xl';

interface ScreenInfo {
  width: number;
  height: number;
  size: ScreenSize;
  isMobile: boolean;
  isTablet: boolean;
  isDesktop: boolean;
  orientation: 'portrait' | 'landscape';
  isLandscape: boolean;
  isPortrait: boolean;
}

export const useScreenSize = (): ScreenInfo => {
  const [screenInfo, setScreenInfo] = useState<ScreenInfo>(() => getScreenInfo());

  function getScreenInfo(): ScreenInfo {
    const width = window.innerWidth;
    const height = window.innerHeight;
    
    let size: ScreenSize = 'xs';
    if (width >= 1536) size = '2xl';
    else if (width >= 1280) size = 'xl';
    else if (width >= 1024) size = 'lg';
    else if (width >= 768) size = 'md';
    else if (width >= 640) size = 'sm';

    const orientation = width > height ? 'landscape' : 'portrait';

    return {
      width,
      height,
      size,
      isMobile: width < 768,
      isTablet: width >= 768 && width < 1024,
      isDesktop: width >= 1024,
      orientation,
      isLandscape: orientation === 'landscape',
      isPortrait: orientation === 'portrait',
    };
  }

  useEffect(() => {
    const handleResize = () => {
      setScreenInfo(getScreenInfo());
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  return screenInfo;
};
