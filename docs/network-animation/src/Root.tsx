import {Composition} from 'remotion';
import {FPS, INSIDE_DURATION, InsideLayout, PHYSICAL_DURATION, PhysicalLayout} from './NetworkLayout';

const themes = ['dark', 'light'] as const;

// One composition per scene and GitHub theme, the README picks the matching GIF via <picture>
export const Root: React.FC = () => (
  <>
    {themes.map((theme) => (
      <Composition
        key={`physical-${theme}`}
        id={`network-physical-${theme}`}
        component={PhysicalLayout}
        durationInFrames={PHYSICAL_DURATION}
        fps={FPS}
        width={1280}
        height={720}
        defaultProps={{theme}}
      />
    ))}
    {themes.map((theme) => (
      <Composition
        key={`inside-${theme}`}
        id={`network-inside-${theme}`}
        component={InsideLayout}
        durationInFrames={INSIDE_DURATION}
        fps={FPS}
        width={1280}
        height={720}
        defaultProps={{theme}}
      />
    ))}
  </>
);
