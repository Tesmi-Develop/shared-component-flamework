# 🔥 shared-components-flamework

<div align="center">

[![ISC License](https://img.shields.io/badge/license-MIT-blue.svg)](https://opensource.org/licenses/MIT)
[![npm version](https://img.shields.io/npm/v/@rbxts/shared-components-flamework)](https://www.npmjs.com/package/@rbxts/shared-components-flamework)

<div align="left">

A powerful library for creating synchronized server-client components in Roblox. This package simplifies state management and networking between server and client in components while maintaining type safety.

## Features
- 🔄 Automatic state synchronization between server and client

- 🏷️ Type-safe component definitions

- 🎮 Built-in networking with events and actions

- 🎛️ Support for decorators

## 📦 Installation
```bash
npm install shared-components-flamework
```

## 🚀 Getting Started

### 1️⃣ Create Shared Component

```ts
// shared/components/counter.ts

// define state
interface State {
   	value: number;
}

@Component()
export class CounterComponent extends SharedComponent<State> {
  	protected state = { value: 0 };  // Initial state
}
```

### 2️⃣ Server Implementation

```ts
// server/components/counter.ts  
@Component({ tag: "Counter" })
export class ServerCounterComponent extends CounterComponent implements OnStart {
  	public onStart() {
		task.spawn(() => {
			while (task.wait(3)) {
				this.Increment();
			}
		});
	}

	@Action() // State modifier
	private Increment() {
		return {
			...this.state,
			value: this.state.value + 1,
		};
	}
}
```

### 3️⃣ Client Implementation
```ts
// client/components/counter.ts  
@Component({
	tag: "Counter",
})
export class ClientCounterComponent extends CounterComponent {
	@Subscribe((state) => state.value)
	private onIncrement(newValue: number) {
		print(`new value: ${newValue}`);
	}
}
```

## 🌐 Networking
With this package you can declare remote event, action inside the component, this will allow you to easily make interaction between server and client component 

```ts
@Component()
export class SomeSharedComponent extends SharedComponent<{}> {
	protected state = {};

	protected remotes = {
		ClientEvent: SharedComponentNetwork.event<ServerToClient, [value: number]>(),
		ServerEvent: SharedComponentNetwork.event<ClientToServer, [value: number]>(),
		Action: SharedComponentNetwork.action<[value: number], void>(),
	};
}

// server
@Component({
	tag: "SomeSharedComponent",
})
export class ServerComponent extends SomeSharedComponent implements OnStart {
	public onStart() {
		this.remotes.ServerEvent.Connect((player, amount) => {
			print(`value = ${amount}, player: ${player}`);
		});

		this.remotes.Action.OnRequest((amount) => {
			print(`Action: value = ${amount}`);
		});

		task.wait(5);
		this.remotes.ClientEvent.Broadcast(1);
	}
}

// client
@Component({
	tag: "SomeSharedComponent",
})
export class ClientComponent extends SomeSharedComponent implements OnStart {
	public onStart() {
		this.remotes.ClientEvent.Connect((amount: number) => {
			print(`value = ${amount}`);
		});
		this.remotes.ServerEvent.Fire(1);
		this.remotes.Action(1);
	}
}
```




## 📚 API Reference
### Core Components

``SharedComponent<S, A, I>``

**The foundation class for all shared components**

```ts
abstract class SharedComponent<
  S = {},                // State type
  A extends object = {}, // Attributes type  
  I extends Instance = Instance // Instance type
> extends BaseComponent<A & { __SERVER_ID?: string }, I>
```

🏷️ Generics:
| Param | Description | Default |
|-------|-------------|---------|
| ``S`` | Component state type | ``any`` |
| ``A`` | Component attributes type | ``{}`` |
| ``I`` | Roblox Instance type | ``Instance`` |




## 🛠️ Public Methods
``GetState(): S``

**Returns current component state**

```ts
const state = component.GetState();
print(`Current value: ${state.value}`);
```

``Dispatch(newState: S): S``

**Updates component state and triggers updates**

```ts
component.Dispatch({ 
	...component.GetState(),
	value: 42 
});
```

``Subscribe()``

**State change subscription methods**

**Overload 1 - Full state**

```ts
Subscribe(listener: (state: S, prevState: S) => void): () => void
```

**Example:**

```ts
const unsubscribe = component.Subscribe((state, prevState) => {
	print(`State changed from ${prevState.value} to ${state.value}`);
});
```

**Overload 2 - Selected value**

```ts
Subscribe<T>(
	selector: (state: S) => T,
	listener: (value: T, prevValue: T) => void  
): () => void
```

**Example:**

```ts
component.Subscribe(
	state => state.counter,
	(value, prevValue) => print(`Counter changed: ${prevValue}→${value}`)
);
```

``GenerateInfo(): SharedComponentInfo``

**Generates component metadata**

```ts
const info = component.GenerateInfo();
print(`Component ID: ${info.ServerId}`);
```

``ResolveIsSyncForPlayer(player: Player, data: SyncPatch<S>): boolean``

**Controls state sync permissions**

```ts
// Override to customize:
ResolveIsSyncForPlayer(player, patch) {
	return true;
}
```

``ResolveSyncForPlayer(player: Player, data: SyncPatch<S>): SyncPatch<S>``

**Filters/modifies state before syncing**

```ts
ResolveSyncForPlayer(player, patch) {
	return patch
}
```

``ResolveConnectionPermission(player: Player): boolean``

**Determines whether a player is authorized to establish a connection to this shared component instance**

```ts
ResolveConnectionPermission(player, patch) {
	return patch
}
```

``AttachDevTool(): void``

**Enables debugging interface**

```ts
component.AttachDevTool(); // Sends the state in the REFLEX_DEVTOOLS event
```


``DisableDevTool(): void``

**Disables debugging tools**

```ts
component.DisableDevTool();
```

``GetIsConnected(): boolean``

🖥️ **Client-only**

**Checks if component is connected to network**

```ts
if (component.GetIsConnected()) {
  print("Component is actively connected!");
}
```

``Connect(): void``

🖥️ **Client-only**

**Establishes network connection to the server**

```ts
component.Connect(); 
```

``Disconnect(): void``

🖥️ **Client-only**

**Terminates network connection to the server**

```ts
component.Disconnect(); 
```

``IsConnectedPlayer(player: Player): boolean``

🖥️ **Server-only**

**Checks if specific player is connected**

```ts
if (component.IsConnectedPlayer(player)) { ... }
```

``GetConnectedPlayers(): ReadonlySet<Player>``

🖥️ **Server-only**

**Returns set of connected players**

```ts
const players = component.GetConnectedPlayers();
```

``DisconnectPlayer(player: Player): void``

🖥️ **Server-only**

**Force disconnects specific player**

```ts
component.DisconnectPlayer(player);
```

``OnConnected(): void``

🖥️ **Client-only**

**Fired when client component successfully connects**

```ts
OnConnected() {
	...
}
```

``OnDisconnected(): void``

🖥️ **Client-only**

**Fired when client component disconnects**

```ts
OnDisconnected() {
	...
}
```

``OnConnectedPlayer(player: Player): void``

🖥️ **Server-only**

**Fired when new player connects**

```ts
OnConnectedPlayer(player: Player) {
	...
}
```

``OnDisconnectedPlayer(player: Player): void``

🖥️ **Server-only**

**Fired when player disconnects**

```ts
OnDisconnectedPlayer(player: Player) {
	...
}
```



## 🔐 Protected Members

``remotes: Record<string, ISharedNetwork>``

Network communication interface

```ts
protected remotes = {
	EventName: SharedComponentNetwork.event<[param1: type]>(),
	ActionName: SharedComponentNetwork.action<[params], returnType>()
};
```

``state: S``

Initial state declaration

```ts
protected state = {
	value: 0,
	items: [] as string[]  
};
```

``isBlockingServerDispatches: boolean``

🖥️ **Client-only**

When ``true``, blocks all state updates from server

```ts
// Client code example
protected isBlockingServerDispatches = true; // Pause updates

// Later...
this.isBlockingServerDispatches = false; // Resume updates
```

``isAutoConnect: boolean``

🖥️ **Client-only**

When ``true`` (default), automatically connects on component initialization

```ts
// Disable auto-connect
protected isAutoConnect = false;

// Manual connection later
this.Connect(); 
```


## 🎛️ Decorators

``@Action()``

Marks state-modifying methods

```ts
@Action()
public increment(amount: number) {
	return {
		...this.state,
		value: this.state.value + amount
	};
}
```

``@Subscribe()``

Auto-subscribes methods to state changes

```ts
@Subscribe(state => state.value)
private onValueChange(value: number) {
	// Called only when value changes
}
```




## 🌐 Networking Utilities

``SharedComponentNetwork``

``event<T extends unknown[]>()``

Creates type-safe network event
```ts
const event = SharedComponentNetwork.event<[message: string, priority: number]>();
```

``action<Args extends unknown[], Return>()``

Creates type-safe network action

```ts
const action = SharedComponentNetwork.action<[id: string], boolean>();
```

## ⚠️ Important Notes

Always return **new state objects** in actions or on dispatch:

```ts
// ✅  Good
return { 
  ...state,
  value: newValue
};

// ❌ Bad
state.value = newValue;
return state;
```

<p align="center">
shared-components-flamework is released under the <a href="LICENSE.md">MIT License</a>.
</p>

<div align="center">

[![MIT License](https://img.shields.io/github/license/Tesmi-Develop/shared-component-flamework?style=for-the-badge)](LICENSE.md)
