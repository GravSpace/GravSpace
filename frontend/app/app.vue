<script lang="ts" setup>
import { Toaster, toast } from 'vue-sonner'
import 'vue-sonner/style.css'

</script>

<template>
  <div>
    <NuxtLoadingIndicator :color="`linear-gradient(to right, var(--gradient-from), var(--gradient-to))`" :height="3"
      :duration="2000" :throttle="0"
      :estimatedProgress="(duration, elapsed) => Math.min(100, (elapsed / duration) * 90)" />
    <Toaster />
    <NuxtLayout>
      <NuxtRouteAnnouncer />
      <NuxtPage />
    </NuxtLayout>
  </div>
</template>