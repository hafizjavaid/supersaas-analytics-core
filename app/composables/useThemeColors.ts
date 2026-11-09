const THEME_VARIABLES = {
	primary: "--ui-primary",
	info: "--ui-info",
	success: "--ui-success",
	warning: "--ui-warning",
	neutral: "--ui-text-dimmed",
	text: "--ui-text-muted",
	border: "--ui-border",
	background: "--ui-bg",
} as const;

export type ThemeColors = Record<keyof typeof THEME_VARIABLES, string>;

// The theme defines colours in oklch, which ECharts cannot parse, so each one is painted onto a canvas and read back as rgb.
function resolveToRgb(context: CanvasRenderingContext2D, cssColor: string) {
	context.clearRect(0, 0, 1, 1);
	context.fillStyle = cssColor;
	context.fillRect(0, 0, 1, 1);
	const [red, green, blue] = context.getImageData(0, 0, 1, 1).data;
	return `rgb(${red}, ${green}, ${blue})`;
}

function readThemeColors(): ThemeColors {
	const styles = getComputedStyle(document.documentElement);
	const context = document.createElement("canvas").getContext("2d", { willReadFrequently: true })!;
	const probe = document.createElement("span");
	document.body.appendChild(probe);
	const colors = Object.fromEntries(Object.entries(THEME_VARIABLES).map(([name, variable]) => {
		probe.style.color = styles.getPropertyValue(variable).trim();
		return [name, resolveToRgb(context, getComputedStyle(probe).color)];
	})) as ThemeColors;
	probe.remove();
	return colors;
}

export function useThemeColors() {
	const colorMode = useColorMode();
	const colors = ref<ThemeColors>();

	onMounted(() => {
		watch(() => colorMode.value, async () => {
			await nextTick();
			colors.value = readThemeColors();
		}, { immediate: true });
	});

	return colors;
}
