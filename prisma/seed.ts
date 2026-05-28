import { PrismaClient } from "@prisma/client"

const prisma = new PrismaClient()

async function main() {
  console.log("Seeding database...")

  const source1 = await prisma.sourceChannel.upsert({
    where: { username: "channel_username_1" },
    update: {},
    create: {
      username: "channel_username_1",
      title: "Example Source 1",
      isActive: true,
    },
  })
  console.log(`  ✓ Source channel: ${source1.username}`)

  const source2 = await prisma.sourceChannel.upsert({
    where: { username: "channel_username_2" },
    update: {},
    create: {
      username: "channel_username_2",
      title: "Example Source 2",
      isActive: true,
    },
  })
  console.log(`  ✓ Source channel: ${source2.username}`)

  const target = await prisma.targetChannel.upsert({
    where: { username: "your_target_channel" },
    update: {},
    create: {
      username: "your_target_channel",
      title: "Main Target Channel",
      isActive: true,
    },
  })
  console.log(`  ✓ Target channel: ${target.username}`)

  const existingPair = await prisma.forwardingPair.findFirst({
    where: {
      sourceChannelId: source1.id,
      targetChannelId: target.id,
    },
  })

  if (!existingPair) {
    await prisma.forwardingPair.create({
      data: {
        sourceChannelId: source1.id,
        targetChannelId: target.id,
        isActive: true,
      },
    })
    console.log("  ✓ Forwarding pair created")
  }

  await prisma.botSetting.upsert({
    where: { id: "singleton" },
    update: {},
    create: {
      id: "singleton",
      isRunning: true,
      adDetectionEnabled: true,
      aiAdDetection: true,
      translationEnabled: true,
    },
  })
  console.log("  ✓ Bot settings initialized")

  const sampleLogs = [
    {
      sourceChannelId: source1.id,
      targetChannelId: target.id,
      originalText: "Breaking news: Major development in peace negotiations between Israel and UAE.",
      translatedText: null,
      detectedLang: "en",
      isAd: false,
      status: "forwarded",
    },
    {
      sourceChannelId: source2.id,
      targetChannelId: target.id,
      originalText: "חדשות חמות: הושגה פריצת דרך משמעותית במו\"מ לשלום",
      translatedText: "Hot news: A significant breakthrough has been achieved in the peace negotiations.",
      detectedLang: "he",
      isAd: false,
      status: "forwarded",
    },
    {
      sourceChannelId: source1.id,
      targetChannelId: target.id,
      originalText: "🔥 LIMITED TIME OFFER: Get 50% off on all products today only! Use code FLASH50 at checkout. Don't miss out!",
      translatedText: null,
      detectedLang: "en",
      isAd: true,
      status: "skipped_ad",
    },
    {
      sourceChannelId: source2.id,
      targetChannelId: target.id,
      originalText: "מבצע ענק! 70% הנחה על כל המוצרים לחגים! כנסו עכשיו לקישור",
      translatedText: "Huge sale! 70% off all holiday products! Enter the link now",
      detectedLang: "he",
      isAd: true,
      status: "skipped_ad",
    },
  ]

  for (const log of sampleLogs) {
    await prisma.translationLog.create({
      data: log,
    })
  }
  console.log(`  ✓ ${sampleLogs.length} sample logs created`)

  console.log("\n✅ Seed completed successfully")
}

main()
  .catch((e) => {
    console.error("Seed error:", e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
