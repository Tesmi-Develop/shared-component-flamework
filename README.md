# 📈 shared-components-flamework
This package will allow you to create shared components that will synchronize between server and client. 
This package is reflex-based, so it is important to know how to work with it to understand how this package works.

## Example
A code snippet showing you how to create the shared component.

```ts
// shared
interface State {
	value: number;
}

@Component()
export class ValueStorageComponent extends SharedComponent<State> {
	protected state = {
		value: 0,
	};
}

// server
@Component({
	tag: "ValueStorageComponent",
})
export class ServerValueStorageComponent extends ValueStorageComponent implements OnStart {
	public onStart() {
		task.spawn(() => {
			while (task.wait(3)) {
				this.increment();
			}
		});
	}

	@Action()
	private increment() {
		return {
			...this.state,
			value: this.state.value + 1,
		};
	}
}

// client
@Component({
	tag: "ValueStorageComponent",
})
export class ClientValueStorageComponent extends ValueStorageComponent {
	@Subscribe((state) => state.value)
	private onIncrement(newValue: number) {
		print(`new value: ${newValue}`);
	}
}

```

## Networking
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

## API

* SharedComponent<S, A, I>

The base class of any sharedComponent. 
Accepts three generics("S" - type describing the state of the component, "A" - attributes of the component, "I" - type of instance of the component)

* @Action()
  
Decorator turns your method into action. (action is a function that changes the state of your component).

* @Subscribe(selector, predicate?)
  
This decorator subscribes your method to listen for a state change.

