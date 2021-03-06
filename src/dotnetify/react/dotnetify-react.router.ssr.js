/* 
Copyright 2017-2020 Dicky Suryadi

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
 */
import dotnetify from './dotnetify-react';
import dotnetifyVM from '../core/dotnetify-vm';
import $ from '../libs/jquery-shim';

const window = window || global || {};
const ssrStatesKey = '__dotnetify_ssr_states__';
const ssrCallbackKey = '__dotnetify_ssr__';

// Gets a VM initial state generated by server-side render script.
export function getSsrState(iVMId) {
  const ssrStates = window[ssrStatesKey];
  return ssrStates && ssrStates.hasOwnProperty(iVMId) && ssrStates[iVMId];
}

export default function enableSsr() {
  // Override dotnetify.react.connect for server-side render.
  const connect = dotnetify.react.connect;
  dotnetify.react.connect = function(iVMId, iComponent, iOptions) {
    const ssrState = getSsrState(iVMId);
    if (ssrState) {
      try {
        iComponent.state = ssrState;
      } catch (e) {}
    }

    if (dotnetify.ssr) {
      if (!ssrState) console.error(`Could not find ssr state for ${iVMId}.`);

      const self = dotnetify.react;
      let vmState = ssrState;
      const options = {
        ...iOptions,
        getState: () => vmState,
        setState: state => (vmState = $.extend(vmState, state))
      };

      const vm = (self.viewModels[iVMId] = new dotnetifyVM(iVMId, iComponent, options, self, {}));

      // Need to be asynch to allow initial state to be processed.
      setTimeout(() => vm.$update(JSON.stringify(vmState)));
      return vm;
    }

    return connect(iVMId, iComponent, iOptions);
  };

  // Override useConnect for server-side render.
  const useConnect = dotnetify.react.useConnect;
  dotnetify.react.useConnect = function(iVMId, iComponent, iOptions) {
    const ssrState = getSsrState(iVMId);
    if (ssrState) {
      if (iComponent.state) iComponent.state = ssrState;
      else iComponent = ssrState;
    }

    if (dotnetify.ssr) {
      if (!ssrState) console.error(`Could not find ssr state for ${iVMId}.`);

      const component = {
        get state() {
          return ssrState;
        }
      };

      const vm = dotnetify.react.connect(iVMId, component, iOptions);
      return { vm, state: ssrState };
    }

    return useConnect(iVMId, iComponent, iOptions);
  };

  // Called from server to configure server-side rendering.
  dotnetify.react.router.ssr = function(iCallbackFn, iRequestUrlPath, iInitialState, iTimeout) {
    dotnetify.ssr = true;
    dotnetify.react.router.urlPath = iRequestUrlPath;

    // Insert initial states in the head tag.
    const script = document.createElement('script');
    const head = document.getElementsByTagName('head')[0];
    script.type = 'text/javascript';
    script.text = `window['${ssrStatesKey}'] = ${iInitialState};`;
    if (head) head.insertBefore(script, head.firstChild);
    else console.error('router> document head tag is required for server-side render.');

    let routed = false;
    const callback = () => iCallbackFn(null /*for error*/, `<!DOCTYPE html><html>${document.documentElement.innerHTML}</html>`);
    const fallback = iTimeout ? setTimeout(() => !routed && callback(), iTimeout) : 0;

    // Once routed, do the callback.
    const unsub = dotnetify.react.router.routedEvent.subscribe(() => {
      routed = true;
      if (fallback != 0) clearTimeout(fallback);
      // Use setTimeout before callback to give a chance for the routed component to render.
      setTimeout(() => callback(), 100);
      unsub();
    });

    // Add initial states into the window scope for the server-renderd iComponents.
    window[ssrStatesKey] = JSON.parse(iInitialState);
  };

  dotnetify.react.router.getSsrState = getSsrState;

  // To initiate SSR, the app needs to set up a callback function in the global window which calls the 'ssr.js' script.
  if (typeof window[ssrCallbackKey] == 'function') window[ssrCallbackKey](dotnetify.react.router.ssr);
}

dotnetify.react.router.ssr = () => console.error('To run server-side render, call enableSsr().');
