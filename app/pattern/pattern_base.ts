import type {Pattern} from './pattern.js'

export const PatternClasses: (typeof Pattern)[] = []

export function getPatternClass(typeName: string): typeof Pattern | undefined {
  for (let cls of PatternClasses) {
    if (cls.getPatternDef().typeName === typeName) {
      return cls
    }
  }
}
