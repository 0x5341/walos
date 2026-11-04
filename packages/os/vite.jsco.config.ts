import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  plugins: [
    {
      name: 'jsco-browser-only',
      transform(code, id) {
        if (!id.endsWith('/@pavelsavara/jsco/index.js')) return;
        // The npm root also exports Node hosts/CLI. They are never used by this
        // adapter and otherwise pull Node builtins into the browser bundle.
        // preview.2 drops the future handle without notifying its producer.
        // Keep the patch pinned and fail loudly when upgrading the engine.
        const futureDrop = 'dropReadable(e,t){o.delete(t)}';
        if (!code.includes(futureDrop)) throw new Error('Review jsco future cancellation patch');
        code = code.replace(
          futureDrop,
          'dropReadable(e,t){o.get(t)?.cancel?.();o.delete(t);r.delete(-2&t)}',
        );
        // preview.2 copies guest-written future bytes but never decodes their
        // payload for JS readers. Decode at write time (before guest buffers are
        // freed), preserving own resources and result resolve/reject semantics.
        const futureWrite =
          'Ic=(e,t)=>{const n=t.element,r=e.resolved.yieldThrottle,o=void 0!==e.resolved.wrapLower;return{callerElement:t.callerElement,element:n,binder:Fn(async(e,t)=>({result:pc((t,r)=>e.futures.write(n.type,t,r),e,r,o)}),n.selfSortIndex)}}';
        if (!code.includes(futureWrite)) throw new Error('Review jsco typed future write patch');
        code = code.replace(
          futureWrite,
          `Ic=(context,plan)=>{
          const n=plan.element, resolved=context.resolved;
          const type=resolved.resolvedTypes.get(n.type);
          if (!type || type.tag!==65) throw new Error('Expected canonical future type');
          const payload=type.value===undefined?undefined:nr(resolved,er(resolved,type.value));
          const loader=payload&&ni(payload,resolved.stringEncoding,resolved.canonicalResourceIds,resolved.ownInstanceResources,resolved.usesNumberForInt64);
          const store=payload&&Gi(payload,resolved.stringEncoding,resolved.canonicalResourceIds,resolved.ownInstanceResources);
          const storer=payload?.tag===71?Qi(store):store;
          return {callerElement:plan.callerElement,element:n,binder:Fn(async(memory)=>({result:pc((handle,ptr)=>{
            const entry=memory.futures.getEntry(handle);
            if (!entry) return 1;
            const value=loader?loader(memory,ptr):undefined;
            entry.resolvedValue=payload?.tag===71?value.val:value;
            entry.rejected=payload?.tag===71&&value.tag==='err';
            entry.storer=storer;
            return memory.futures.write(n.type,handle,0);
          },memory,resolved.yieldThrottle,resolved.wrapLower!==undefined)}),n.selfSortIndex)}
        }`,
        );
        // preview.2 groups imported resource aliases by export name, missing
        // same-instance eq aliases (HTTP headers/trailers are aliases of fields).
        // Canonicalize only explicit type equality; never relax handle checks.
        const canonical = 'function Mo(e){';
        const lookup = 'function Uo(e,t){';
        if (!code.includes(canonical) || !code.includes(lookup))
          throw new Error('Review jsco resource equality patch');
        code = code.replace(canonical, 'function MoBase(e){').replace(
          lookup,
          `
          function Mo(e) {
            MoBase(e);
            const ids = e.resolved.canonicalResourceIds;
            e.indexes.componentInstances.forEach((instance, instanceIndex) => {
              if (instance.tag !== 98) return;
              const roots = [], groups = new Map();
              let index = 0;
              for (const declaration of instance.declarations) {
                if (!uc(declaration)) continue;
                let root = index;
                if (declaration.tag === 106 && declaration.ty.tag === 124 && declaration.ty.value.tag === 127)
                  root = roots[declaration.ty.value.value] ?? root;
                roots[index++] = root;
                if (declaration.tag !== 106 || declaration.ty.tag !== 124) continue;
                const key = instanceIndex + ':' + declaration.name.name;
                const keys = groups.get(root) ?? [];
                keys.push(key);
                groups.set(root, keys);
              }
              for (const keys of groups.values()) {
                const id = keys.map(key => e.resourceAliasGroups.get(key)).find(id => id !== undefined);
                if (id !== undefined) for (const key of keys) e.resourceAliasGroups.set(key, id);
              }
            });
            e.indexes.componentTypes.forEach((type, index) => {
              if (type.tag === 10 && type.kind === 3) {
                const id = e.resourceAliasGroups.get(type.instance_index + ':' + type.name);
                if (id !== undefined) ids.set(index, id);
              }
            });
          }
          function Uo(e,t){`,
        );
        // Async canonical lower imports always receive a result pointer, including
        // scalar results (e.g. descriptor.is-same-object -> bool). preview.2
        // incorrectly selects a flat return for a single scalar and never stores it.
        const asyncResult = 'g=2===r.params?2===r.results?Ko:qo:2===r.results?Xo:Zo';
        if (!code.includes(asyncResult)) throw new Error('Review jsco async scalar result patch');
        code = code.replace(
          asyncResult,
          'g=n?2===r.params?Ko:Xo:2===r.params?2===r.results?Ko:qo:2===r.results?Xo:Zo',
        );
        return code.replace(
          /import\(["']\.\/(?:cli|wasip3-node)\.js["']\)/g,
          'Promise.reject(new Error("Node-only jsco API unavailable in a browser"))',
        );
      },
    },
  ],
  build: {
    // Share Future identity and async-operation cancellation with Context.
    rollupOptions: { external: ['../async.js'] },
    lib: {
      entry: Object.fromEntries(
        ['component-jsco'].map((name) => [
          name,
          fileURLToPath(new URL(`./src/internal/${name}.ts`, import.meta.url)),
        ]),
      ),
      formats: ['es'],
      fileName: (_format, name) => `${name}.js`,
    },
    outDir: fileURLToPath(new URL('./dist/internal', import.meta.url)),
    emptyOutDir: false,
    minify: true,
  },
});
