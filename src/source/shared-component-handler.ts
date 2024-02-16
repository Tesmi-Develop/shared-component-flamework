import { Controller, Modding, OnInit, Reflect, Service } from "@flamework/core";
import {
	BroadcastReceiver,
	Broadcaster,
	ProducerMiddleware,
	createBroadcastReceiver,
	createBroadcaster,
} from "@rbxts/reflex";
import { ReplicatedStorage, RunService } from "@rbxts/services";
import { Slices } from "../state/slices";
import { remotes } from "../remotes";
import { rootProducer } from "../state/rootProducer";
import { OnlyServer } from "./decorators/only-server";
import { CreateGeneratorId, logAssert, logWarning } from "../utilities";
import { Component } from "@flamework/components";
import { SharedComponent } from "./shared-component";
import { Constructor } from "@flamework/core/out/utility";
import {
	SelectListSharedComponentMetadata,
	SelectSharedComponent,
	SelectSharedComponentMetadata,
} from "../state/slices/selectors";
import { DecoratorImplementations } from "./functions/registery-decorator-implementation";
import { t } from "@rbxts/t";
import { restoreNotChangedProperties } from "./functions/restoreNotChangedProperties";
import { DISPATCH } from "../state/slices/replication";

const event = ReplicatedStorage.FindFirstChild("REFLEX_DEVTOOLS") as RemoteEvent;

interface ConstructorWithIndex extends Constructor {
	__index: object;
}

const devToolMiddleware: ProducerMiddleware = () => {
	return (nextAction, actionName) => {
		return (...args) => {
			const state = nextAction(...args);
			if (RunService.IsStudio() && event) {
				event.FireServer({ name: actionName, args: [...args], state });
			}

			return state;
		};
	};
};

const restoreNotChangedStateMiddleware: ProducerMiddleware = () => {
	return (nextAction, actionName) => {
		return (...args) => {
			if (actionName === DISPATCH) {
				const [id, newState] = args as Parameters<(typeof rootProducer)[typeof DISPATCH]>;
				const typedAction = nextAction as (typeof rootProducer)[typeof DISPATCH];
				const oldState = rootProducer.getState(SelectSharedComponent(id));

				if (oldState === undefined) {
					return nextAction(...args);
				}

				if (oldState === undefined || newState === undefined) return nextAction(...args);

				const validatedState = restoreNotChangedProperties(newState, oldState);

				return typedAction(id, validatedState);
			}

			return nextAction(...args);
		};
	};
};

export interface onSetupSharedComponent {
	onSetup(): void;
}

type Metadata = string;

@Service({
	loadOrder: 0,
})
@Controller({
	loadOrder: 0,
})
export class SharedComponentHandler implements OnInit {
	private receiver!: BroadcastReceiver<typeof Slices>;
	private broadcaster!: Broadcaster;
	private instances = new Map<Metadata, Map<Instance, string>>();
	private instancesById = new Map<string, SharedComponent<object>>();
	private sharedComponents = new Map<Constructor, Map<Instance, object>>();
	private sharedComponentContructors = new Map<
		Constructor<SharedComponent<object>>,
		Constructor<SharedComponent<object>>
	>(); // index - component, value - shared component
	private sharedcomponentTrees = new Map<Constructor, Constructor[]>();
	private idGenerator = CreateGeneratorId(true);

	/**
	 * @deprecated
	 * @hidden
	 */
	public onInit() {
		this.registerySharedComponents();
		this.implementDecorators();
		RunService.IsServer() && this.serverSetup();
		RunService.IsClient() && this.clientSetup();
	}

	public AttachReflexDevTools() {
		rootProducer.applyMiddleware(devToolMiddleware);
	}

	private getConstructorIdentifier(constructor: Constructor) {
		return (Reflect.getMetadata(constructor, "identifier") as string) ?? "Not found id";
	}

	private implementDecorators() {
		DecoratorImplementations.forEach((implementationData, decoratorId) => {
			this.sharedComponentContructors.forEach((sharedComponentContructor, constructor) => {
				const props = Modding.getPropertyDecorators(constructor, decoratorId);
				if (props.isEmpty()) return;
				implementationData.callback(constructor, props, sharedComponentContructor);
			});
		});
	}

	private clientSetup() {
		this.receiver = createBroadcastReceiver({
			start: () => {
				remotes._shared_component_start.fire();
			},
		});

		remotes._shared_component_dispatch.connect((actions) => {
			this.receiver.dispatch(actions);
		});

		remotes._shared_component_reciveInstanceId.connect((instance, metadata, id) => {
			this.addNewInstance(instance, metadata, id);
		});

		rootProducer.applyMiddleware(this.receiver.middleware, restoreNotChangedStateMiddleware);
	}

	private serverSetup() {
		this.broadcaster = createBroadcaster({
			producers: Slices,
			hydrateRate: -1,

			dispatch: (player, actions) => {
				remotes._shared_component_dispatch.fire(player, actions);
			},
		});

		rootProducer.applyMiddleware(this.broadcaster.middleware);
		remotes._shared_component_start.connect((player) => this.broadcaster.start(player));

		remotes._shared_component_getInstanceId.onRequest((player, instance, metadata) => {
			return this.instances.get(metadata)?.get(instance);
		});

		remotes._shared_component_requestMethod.onRequest((player, fullId, method, args) => {
			const component = this.instancesById.get(fullId);
			if (!component) return;
			const constructor = getmetatable(component) as Constructor<SharedComponent<object>>;

			const checkerArguments = Reflect.getMetadata<t.check<unknown>[]>(
				constructor,
				"flamework:parameter_guards",
				method,
			);

			if (!checkerArguments) {
				logWarning(`Method ${method} does not have parameter guards`);
				return;
			}

			let isPassedValidation = true;
			checkerArguments.every((checker, index) => {
				isPassedValidation = checker(args[index]);
				return isPassedValidation;
			});

			if (!isPassedValidation) return;

			return (component[method as never] as Callback)(component, ...args);
		});
	}

	public async GetInstanceById(instance: Instance, metadata: Metadata) {
		if (RunService.IsServer()) {
			return this.instances.get(metadata)?.get(instance);
		}

		if (this.instances.get(metadata)?.has(instance)) {
			return this.instances.get(metadata)?.get(instance);
		}

		const result = await remotes._shared_component_getInstanceId(instance, metadata);
		result && this.addNewInstance(instance, metadata, result);
		return result;
	}

	public RegisterSharedComponentInstance(component: SharedComponent<object>, id: string) {
		this.instancesById.set(id, component);
	}

	public RemoveSharedComponentInstance(id: string) {
		this.instancesById.delete(id);
	}

	private addNewInstance(instance: Instance, metadata: Metadata, id: string) {
		let instances = this.instances.get(metadata);

		if (!instances) {
			instances = new Map();
			this.instances.set(metadata, instances);
		}

		instances.set(instance, id);
	}

	/**
	 * @server
	 */
	@OnlyServer
	public AddNewInstance(instance: Instance, metadata: Metadata, id: string) {
		this.addNewInstance(instance, metadata, id);
		remotes._shared_component_reciveInstanceId.fireAll(instance, metadata, id);
	}

	public GetSharedComponentMetadataId(component: Constructor) {
		const identifier = Reflect.getMetadata(component as object, "identifier") as string;
		logAssert(identifier, "Failed to get identifier");

		return rootProducer.getState(SelectSharedComponentMetadata(identifier));
	}

	private instanceOfSharedComponent(obj: object) {
		const metatable = getmetatable(obj) as ConstructorWithIndex;
		return metatable.__index === SharedComponent;
	}

	/**
	 * @hidden
	 */
	public RegisteryDescendantSharedComponent(component: SharedComponent<object>) {
		const sharedClass = this.getSharedComponent(getmetatable(component) as Constructor);
		let instances = this.sharedComponents.get(sharedClass);
		logAssert(sharedClass, "Failed to get shared component");

		if (!instances) {
			instances = new Map();
			this.sharedComponents.set(sharedClass, instances);
		}

		if (instances.has(component.instance)) {
			logWarning(
				`${sharedClass} already has a descendant. The second descendant will have the state of the first descendant `,
			);
			return sharedClass;
		}

		instances.set(component.instance, component);

		return sharedClass;
	}

	private getSharedComponent(constructor: Constructor) {
		let currentClass = constructor as ConstructorWithIndex;
		let metatable = getmetatable(currentClass) as ConstructorWithIndex;

		while (currentClass && metatable.__index !== SharedComponent) {
			currentClass = metatable.__index as ConstructorWithIndex;
			metatable = getmetatable(currentClass) as ConstructorWithIndex;
		}

		return currentClass as Constructor<SharedComponent<object>>;
	}

	private getInheritanceTree<T>(constructor: Constructor) {
		let currentClass = constructor as ConstructorWithIndex;
		let metatable = getmetatable(currentClass) as ConstructorWithIndex;
		const tree = [constructor] as Constructor<T>[];

		while (currentClass && metatable.__index !== SharedComponent) {
			currentClass = metatable.__index as ConstructorWithIndex;
			metatable = getmetatable(currentClass) as ConstructorWithIndex;
			tree.push(currentClass as unknown as Constructor<T>);
		}

		return tree;
	}

	private registerySharedComponents() {
		const listMetadata = rootProducer.getState(SelectListSharedComponentMetadata);
		if (RunService.IsClient() && listMetadata.size() > 0) {
			return;
		}

		const metadata = new Map<Metadata, string>();
		const components = Modding.getDecorators<typeof Component>();

		components.forEach((component) => {
			const componentConstructor = component.constructor;
			if (!componentConstructor) return;
			if (componentConstructor === (SharedComponent as unknown as Constructor)) return;

			const sharedComponentConstructor = this.getSharedComponent(componentConstructor);
			if (!sharedComponentConstructor) return;

			const identifier = this.getConstructorIdentifier(componentConstructor);
			const tree = this.getInheritanceTree<SharedComponent<object>>(componentConstructor);

			this.sharedComponentContructors.set(
				componentConstructor as Constructor<SharedComponent<object>>,
				sharedComponentConstructor,
			);
			this.sharedcomponentTrees.set(componentConstructor, tree);

			if (!this.instanceOfSharedComponent(componentConstructor)) return;

			metadata.set(identifier, this.idGenerator.Next());
		});

		rootProducer.SetComponentMetadatas(metadata);
	}
}
