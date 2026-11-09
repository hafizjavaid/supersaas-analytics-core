<script setup lang="ts">
import { Body, Container, Head, Heading, Html, Link, Preview, Section, Text } from "@vue-email/components";

defineProps<{
	preview: string;
	heading: string;
	actionLabel: string;
	actionUrl: string;
	appName: string;
	footnote: string;
	unsubscribeUrl?: string;
}>();

const fontFamily = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', sans-serif";
const mainStyle = { backgroundColor: "#ffffff", fontFamily };
const containerStyle = { margin: "0 auto", maxWidth: "560px", padding: "40px 24px" };
const headingStyle = { color: "#18181b", fontSize: "22px", fontWeight: "bold", margin: "0 0 24px" };
const textStyle = { color: "#3f3f46", fontSize: "15px", lineHeight: "24px", margin: "0 0 16px" };
const buttonStyle = {
	backgroundColor: "#18181b",
	borderRadius: "6px",
	color: "#ffffff",
	display: "inline-block",
	fontSize: "15px",
	padding: "12px 24px",
	textDecoration: "none",
};
const urlStyle = { color: "#52525b", fontSize: "13px", wordBreak: "break-all" as const };
const footerLinkStyle = { color: "#71717a", textDecoration: "underline" };
const footerStyle = { color: "#a1a1aa", fontSize: "12px", lineHeight: "20px", marginTop: "32px" };
</script>

<template>
	<Html>
		<Head />
		<Preview>{{ preview }}</Preview>
		<Body :style="mainStyle">
			<Container :style="containerStyle">
				<Heading :style="headingStyle">
					{{ heading }}
				</Heading>
				<Text :style="textStyle">
					<slot />
				</Text>
				<slot name="details" />
				<Section :style="{ margin: '24px 0' }">
					<Link
						:href="actionUrl"
						target="_blank"
						:style="buttonStyle"
					>
						{{ actionLabel }}
					</Link>
				</Section>
				<Text :style="textStyle">
					Or copy this link into your browser:
				</Text>
				<Text :style="urlStyle">
					{{ actionUrl }}
				</Text>
				<Text :style="footerStyle">
					{{ footnote }}
					<template v-if="unsubscribeUrl">
						<Link
							:href="unsubscribeUrl"
							target="_blank"
							:style="footerLinkStyle"
						>
							Unsubscribe
						</Link>
					</template>
					<br>
					{{ appName }}
				</Text>
			</Container>
		</Body>
	</Html>
</template>
