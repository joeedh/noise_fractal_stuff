export const PatternClasses = [];

export function getPatternClass(typeName) {
  for (let cls of PatternClasses) {
    if (cls.getPatternDef().typeName === typeName) {
      return cls;
    }
  }
}
