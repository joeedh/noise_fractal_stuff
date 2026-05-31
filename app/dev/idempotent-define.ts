/* Dev-only: make customElements.define() idempotent.
 *
 * The shader hot-reload target (shaders-entry.ts) re-imports the full pattern
 * graph, which transitively pulls in path.ux's widgets — and those call
 * customElements.define() at module-eval time. Since the main bundle already
 * registered those elements, a second registration would throw
 * "the name has already been used with this registry". Patching define() to
 * skip already-registered names makes re-importing the graph safe.
 *
 * This module must be imported before any element-defining module in the
 * shaders bundle (it is the first import in shaders-entry.ts). */
const original = customElements.define.bind(customElements)

customElements.define = function (
  name: string,
  ctor: CustomElementConstructor,
  options?: ElementDefinitionOptions
): void {
  if (customElements.get(name)) {
    return
  }
  original(name, ctor, options)
}

export {}
