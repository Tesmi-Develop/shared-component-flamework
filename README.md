# 📈 shared-components-flamework
This package will allow you to create shared components that will synchronize between server and client. 
This package is reflex-based, so it is important to know how to work with it to understand how this package works.

## Example
A code snippet showing you how to create the shared component.

```ts
// -->> Patern when server and client code in the same class <<--
interface State {
	money: number;
}

@Component({
	tag: `${MoneyStorageComponent}`,
})
export class MoneyStorageComponent extends SharedComponent<State> implements OnStart {
	protected state: State = {
		money: 0,
	};

	public onStart() {
		if (RunService.IsServer()) {
			task.spawn(() => {
				while (task.wait(10)) {
					this.increateMoney(1);
				}
			});
		}
	}

	@SharedSubscribe("Client", (state) => state.money)
	private onChangedMoney(money: number) {
		print(`new count money: ${money}`);
	}

	@Action()
	private incrementMoney(money: number) {
		return {
			...this.state,
			money: this.state.money + money,
		};
	}
}

// -->> Patern with a shared superclass <<--
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
	onStart(): void {
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

## API

* SharedComponent<S, A, I>

The base class of any sharedComponent. 
Accepts three generics("S" - type describing the state of the component, "A" - attributes of the component, "I" - type of instance of the component)

* @Action()
  
Decorator turns your method into action. (action is a function that changes the state of your component).

* @SharedSubscribe(side: "Server" | "Client" | "Both", selector, predicate?)
  
This decorator subscribes your method to listen for a state change.  
side - argument that indicates which side will subscribe this method to listen for state.

* @Subscribe(selector, predicate?)
  
This decorator subscribes your method to listen for a state change.

