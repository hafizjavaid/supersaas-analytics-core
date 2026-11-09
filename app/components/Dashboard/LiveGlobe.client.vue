<script setup lang="ts">
import createGlobe from "cobe";
import type { Globe } from "cobe";
import type { LiveVisitorLocation } from "#layers/core/shared/types/analytics";
import type { Coordinates } from "#layers/core/app/utils/globe";

const props = withDefaults(
	defineProps<{ count: number; locations: LiveVisitorLocation[]; simulate?: boolean; focus?: Coordinates | null; hideCount?: boolean }>(),
	{ simulate: false, focus: null, hideCount: false },
);

const SIMULATED_LOCATIONS: LiveVisitorLocation[] = [
	{ latitude: 37.7749, longitude: -122.4194, count: 3 },
	{ latitude: 40.7128, longitude: -74.006, count: 2 },
	{ latitude: 51.5072, longitude: -0.1276, count: 2 },
	{ latitude: 12.9716, longitude: 77.5946, count: 4 },
	{ latitude: 1.3521, longitude: 103.8198, count: 1 },
	{ latitude: 35.6762, longitude: 139.6503, count: 2 },
	{ latitude: -33.8688, longitude: 151.2093, count: 1 },
	{ latitude: -23.5505, longitude: -46.6333, count: 2 },
	{ latitude: -33.9249, longitude: 18.4241, count: 1 },
];

const AVATAR_SEEDS = ["Felix", "Aneka", "Milo", "Luna", "Jasper", "Zoe", "Arlo", "Cleo", "Finn", "Nala", "Remy", "Sage"];

function hashLocation(latitude: number, longitude: number) {
	let hash = 0;
	for (const character of `${latitude}:${longitude}`) {
		hash = (hash * 31 + character.charCodeAt(0)) >>> 0;
	}
	return hash;
}

const displayedLocations = computed(() => (props.simulate ? SIMULATED_LOCATIONS : props.locations));
const displayedCount = computed(() => (props.simulate ? SIMULATED_LOCATIONS.reduce((total, location) => total + location.count, 0) : props.count));

const avatars = computed(() => displayedLocations.value.map((location) => {
	const hash = hashLocation(location.latitude, location.longitude);
	return {
		id: `visitor-${hash}`,
		location: [location.latitude, location.longitude] as [number, number],
		seed: AVATAR_SEEDS[hash % AVATAR_SEEDS.length]!,
		focused: sameCoordinates(location, props.focus),
	};
}));

// cobe exposes each marker's screen position as a CSS anchor and its visibility as a custom property, so avatars follow the globe without JS.
const markers = computed(() => avatars.value.map(avatar => ({ id: avatar.id, location: avatar.location, size: 0 })));

function avatarStyle(id: string) {
	const visibility = `var(--cobe-visible-${id}, 0)`;
	return {
		positionAnchor: `--cobe-${id}`,
		left: "anchor(center)",
		top: "anchor(center)",
		translate: "-50% -50%",
		opacity: visibility,
		filter: `blur(calc((1 - ${visibility}) * 4px))`,
	};
}

const container = useTemplateRef("container");
const canvas = useTemplateRef("canvas");
const colorMode = useColorMode();
const reduceMotion = usePreferredReducedMotion();

let globe: Globe | null = null;
let rotation = 0;
let theta = DEFAULT_GLOBE_THETA;
let pointerX: number | null = null;
let animationFrame = 0;

function globeColors() {
	return colorMode.value === "dark"
		? { dark: 1, baseColor: [0.3, 0.3, 0.3] as [number, number, number], glowColor: [0.15, 0.15, 0.15] as [number, number, number], mapBrightness: 3 }
		: { dark: 0, baseColor: [1, 1, 1] as [number, number, number], glowColor: [0.96, 0.97, 0.98] as [number, number, number], mapBrightness: 5 };
}

function resize() {
	const bounds = container.value?.getBoundingClientRect();
	if (globe && bounds) {
		globe.update({ width: Math.max(1, bounds.width), height: Math.max(1, bounds.height) });
	}
}

function render() {
	if (!globe) {
		return;
	}
	const easing = reduceMotion.value === "reduce" ? 1 : 0.08;
	if (props.focus && pointerX === null) {
		const target = globeAnglesFor(props.focus);
		rotation = approachAngle(rotation, target.phi, easing);
		theta += (target.theta - theta) * easing;
	}
	else {
		if (reduceMotion.value !== "reduce" && pointerX === null) {
			rotation += 0.0015;
		}
		theta += (DEFAULT_GLOBE_THETA - theta) * easing;
	}
	globe.update({ phi: rotation, theta });
	animationFrame = requestAnimationFrame(render);
}

function mountGlobe(canvasElement: HTMLCanvasElement) {
	const bounds = container.value!.getBoundingClientRect();
	globe = createGlobe(canvasElement, {
		devicePixelRatio: Math.min(window.devicePixelRatio, 2),
		width: Math.max(1, bounds.width),
		height: Math.max(1, bounds.height),
		phi: rotation,
		theta,
		diffuse: 1.2,
		scale: 0.95,
		mapSamples: 12000,
		mapBaseBrightness: 0,
		markerColor: [0.96, 0.45, 0.12],
		markerElevation: 0.03,
		markers: markers.value,
		...globeColors(),
	});
	animationFrame = requestAnimationFrame(render);
}

// On hydration Nuxt renders a .client component's template only after its onMounted, so wait for the canvas instead.
watch(canvas, (canvasElement) => {
	if (canvasElement && !globe) {
		mountGlobe(canvasElement);
	}
}, { flush: "post" });

useResizeObserver(container, resize);
watch(markers, value => globe?.update({ markers: value }));
watch(() => colorMode.value, () => globe?.update(globeColors()));

onBeforeUnmount(() => {
	cancelAnimationFrame(animationFrame);
	globe?.destroy();
	globe = null;
});

function onPointerDown(event: PointerEvent) {
	(event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
	pointerX = event.clientX;
}

function onPointerMove(event: PointerEvent) {
	if (pointerX !== null) {
		rotation += (event.clientX - pointerX) / 180;
		pointerX = event.clientX;
	}
}

function onPointerUp(event: PointerEvent) {
	(event.currentTarget as HTMLElement).releasePointerCapture(event.pointerId);
	pointerX = null;
}

function onPointerCancel() {
	pointerX = null;
}
</script>

<template>
	<div
		ref="container"
		class="relative size-full min-h-72 overflow-hidden"
	>
		<canvas
			ref="canvas"
			role="img"
			:aria-label="`Realtime visitor globe with ${displayedLocations.length} active locations`"
			class="size-full cursor-grab touch-none active:cursor-grabbing"
			@pointerdown="onPointerDown"
			@pointermove="onPointerMove"
			@pointerup="onPointerUp"
			@pointercancel="onPointerCancel"
		/>
		<img
			v-for="avatar in avatars"
			:key="avatar.id"
			:src="`https://api.dicebear.com/10.x/adventurer/svg?seed=${encodeURIComponent(avatar.seed)}&backgroundColor=b6e3f4,c0aede,d1d4f9,ffd5dc,ffdfbf`"
			alt=""
			aria-hidden="true"
			class="pointer-events-none absolute rounded-full bg-white object-cover shadow-md ring-2 transition-[opacity,filter,width,height] duration-200"
			:class="avatar.focused ? 'z-20 size-9 ring-primary' : 'z-10 size-6 ring-white'"
			:style="avatarStyle(avatar.id)"
		>
		<div
			v-if="!hideCount"
			class="pointer-events-none absolute inset-x-0 bottom-2 text-center text-xs text-muted"
		>
			{{ displayedCount > 0 ? `${displayedCount} ${displayedCount === 1 ? "visitor" : "visitors"} online` : "No visitors online" }}
		</div>
	</div>
</template>
