/*
 * Virtual Pioneer DDJ-FLX4 CoreMIDI Simulator for PlayMyJam
 * Registers a real macOS virtual MIDI device ("Pioneer DDJ-FLX4 (Virtual)")
 * so Electron & Chrome detect it via Web MIDI just like physical USB hardware,
 * and prints live LED feedback sent back from PlayMyJam.
 */

#include <CoreFoundation/CoreFoundation.h>
#include <CoreMIDI/CoreMIDI.h>
#include <ctype.h>
#include <math.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <unistd.h>

static MIDIClientRef gClient = 0;
static MIDIEndpointRef gSource = 0;
static MIDIEndpointRef gDest = 0;

static void midiReadProc(const MIDIPacketList *pktlist, void *readProcRefCon, void *srcConnRefCon) {
    (void)readProcRefCon;
    (void)srcConnRefCon;
    const MIDIPacket *packet = &pktlist->packet[0];
    for (UInt32 i = 0; i < pktlist->numPackets; ++i) {
        if (packet->length >= 3) {
            Byte status = packet->data[0];
            Byte cmd = status & 0xF0;
            Byte ch = status & 0x0F;
            Byte d1 = packet->data[1];
            Byte d2 = packet->data[2];
            if (cmd == 0x90) {
                const char *state = d2 > 0 ? "ON  🟢" : "OFF ⚫";
                const char *deck = ch == 0 ? "Deck A" : (ch == 1 ? "Deck B" : "Mixer");
                const char *name = NULL;
                switch (d1) {
                    case 0x0B: name = "PLAY/PAUSE"; break;
                    case 0x0C: name = "CUE"; break;
                    case 0x54: name = "HEADPHONE CUE (PFL)"; break;
                    case 0x58: name = "BPM SYNC"; break;
                    default: break;
                }
                if (name != NULL) {
                    printf("\n  💡 LED %s — %s %s\nDDJ-FLX4> ", state, deck, name);
                } else {
                    printf("\n  💡 LED %s — CH %u Note 0x%02X\nDDJ-FLX4> ", state, (unsigned)(ch + 1), d1);
                }
                fflush(stdout);
            }
        }
        packet = MIDIPacketNext(packet);
    }
}

static void sendMidiBytes(const Byte *bytes, UInt16 len) {
    Byte buffer[256];
    MIDIPacketList *packetList = (MIDIPacketList *)buffer;
    MIDIPacket *cur = MIDIPacketListInit(packetList);
    MIDIPacketListAdd(packetList, sizeof(buffer), cur, 0, len, bytes);
    MIDIReceived(gSource, packetList);
}

static void sendButton(Byte ch, Byte note, const char *label) {
    printf("▶ %s  [CH %u Note 0x%02X]\n", label, (unsigned)(ch + 1), note);
    fflush(stdout);
    Byte onMsg[3] = { (Byte)(0x90 | (ch & 0x0F)), (Byte)(note & 0x7F), 0x7F };
    Byte offMsg[3] = { (Byte)(0x90 | (ch & 0x0F)), (Byte)(note & 0x7F), 0x00 };
    sendMidiBytes(onMsg, 3);
    usleep(60000);
    sendMidiBytes(offMsg, 3);
}

/* Sends authentic 14-bit Pioneer DDJ MSB + LSB CC pair */
static void send14BitCC(Byte ch, Byte msbCC, Byte lsbCC, double normalized) {
    if (normalized < 0.0) normalized = 0.0;
    if (normalized > 1.0) normalized = 1.0;
    int value14 = (int)llround(normalized * 16383.0);
    Byte msb = (Byte)((value14 >> 7) & 0x7F);
    Byte lsb = (Byte)(value14 & 0x7F);
    Byte msbMsg[3] = { (Byte)(0xB0 | (ch & 0x0F)), (Byte)(msbCC & 0x7F), msb };
    Byte lsbMsg[3] = { (Byte)(0xB0 | (ch & 0x0F)), (Byte)(lsbCC & 0x7F), lsb };
    sendMidiBytes(msbMsg, 3);
    sendMidiBytes(lsbMsg, 3);
}

static void sendRelativeJog(Byte ch, int ticks, int steps) {
    int raw = 64 + ticks;
    if (raw < 1) raw = 1;
    if (raw > 127) raw = 127;
    Byte msg[3] = { (Byte)(0xB0 | (ch & 0x0F)), 0x21, (Byte)raw };
    for (int i = 0; i < steps; ++i) {
        sendMidiBytes(msg, 3);
        usleep(45000);
    }
}

static void sweep14Bit(const char *label, Byte ch, Byte msbCC, Byte lsbCC, const double *points, int count) {
    printf("🎚️  %s...\n", label);
    fflush(stdout);
    for (int i = 0; i < count - 1; ++i) {
        double start = points[i];
        double end = points[i + 1];
        const int steps = 20;
        for (int s = 0; s <= steps; ++s) {
            double t = (double)s / (double)steps;
            send14BitCC(ch, msbCC, lsbCC, start + (end - start) * t);
            usleep(25000);
        }
    }
}

static void runDemoSequence(void) {
    printf("\n🚀 Running automated Pioneer DDJ-FLX4 demo sweep — watch PlayMyJam!\n");
    const double volPts[] = { 0.0, 1.0, 0.75 };
    const double cfPts[] = { 0.5, 0.0, 1.0, 0.5 };
    const double eqPts[] = { 0.5, 0.0, 1.0, 0.5 };

    sweep14Bit("Deck A Volume Fader (0% -> 100% -> 75%)", 0, 0x13, 0x33, volPts, 3);
    sweep14Bit("Crossfader (Center -> Full A -> Full B -> Center)", 6, 0x1F, 0x3F, cfPts, 4);
    sweep14Bit("Deck A EQ Low Kill & Boost (50% -> 0% -> 100% -> 50%)", 0, 0x0F, 0x2F, eqPts, 4);
    sweep14Bit("Deck A EQ High Sweep (50% -> 0% -> 100% -> 50%)", 0, 0x07, 0x27, eqPts, 4);
    printf("💿 Spinning Deck A Jog Wheel forward...\n");
    fflush(stdout);
    sendRelativeJog(0, 4, 10);
    sendButton(0, 0x54, "Deck A Headphone Cue (PFL) Toggle ON");
    usleep(400000);
    sendButton(0, 0x54, "Deck A Headphone Cue (PFL) Toggle OFF");
    sendButton(7, 0x01, "Performance Pad 2: Air Horn SFX");
    printf("✅ Demo sweep complete!\n\n");
    fflush(stdout);
}

static void printMenu(void) {
    printf(
        "\n============================================================\n"
        " 🎛️  Virtual Pioneer DDJ-FLX4 ACTIVE in macOS CoreMIDI\n"
        "     Device Name: \"Pioneer DDJ-FLX4 (Virtual)\"\n"
        "============================================================\n"
        " Open PlayMyJam -> Virtual DJ -> Header button turns EMERALD\n"
        " (\"Pioneer DDJ-FLX4 (Virtual)\") automatically!\n\n"
        " Commands (type a letter + press Enter):\n"
        "   d  -> Run full automated Pioneer DDJ-FLX4 demo sweep\n"
        "   a  -> Deck A Play / Pause          b  -> Deck B Play / Pause\n"
        "   c  -> Deck A Cue                   v  -> Deck B Cue\n"
        "   1  -> Load Top Queue -> Deck A     2  -> Load Top Queue -> Deck B\n"
        "   w  -> Sweep Deck A Volume          x  -> Sweep Crossfader (A <-> B)\n"
        "   e  -> Sweep Deck A Low/Mid/High EQ\n"
        "   j  -> Spin Deck A Jog Backward     k  -> Spin Deck A Jog Forward\n"
        "   p  -> Deck A Headphone Cue (PFL)   s  -> Toggle BPM Sync\n"
        "   l  -> SFX Pad 1: Laser             f  -> SFX Pad 2: Air Horn\n"
        "   h  -> Show menu                    q  -> Quit & unplug\n"
        "------------------------------------------------------------\n"
    );
    fflush(stdout);
}

int main(int argc, char **argv) {
    CFStringRef devName = CFSTR("Pioneer DDJ-FLX4 (Virtual)");
    OSStatus status = MIDIClientCreate(CFSTR("PlayMyJamPioneerSim"), NULL, NULL, &gClient);
    if (status != noErr) {
        fprintf(stderr, "Failed to create CoreMIDI client (status %d)\n", (int)status);
        return 1;
    }

    status = MIDISourceCreate(gClient, devName, &gSource);
    if (status != noErr) {
        fprintf(stderr, "Failed to create virtual MIDI source (status %d)\n", (int)status);
        return 1;
    }

    status = MIDIDestinationCreate(gClient, devName, midiReadProc, NULL, &gDest);
    if (status != noErr) {
        fprintf(stderr, "Warning: Could not create virtual MIDI LED destination (status %d)\n", (int)status);
    }

    printMenu();

    for (int i = 1; i < argc; ++i) {
        if (strcmp(argv[i], "--demo") == 0) {
            printf("Waiting 2 seconds for PlayMyJam to detect the virtual controller...\n");
            fflush(stdout);
            sleep(2);
            runDemoSequence();
            printf("Stay online for interactive commands, or press 'q' + Enter to quit.\n");
        }
    }

    char line[128];
    const double volPts[] = { 0.0, 1.0, 0.75 };
    const double cfPts[] = { 0.5, 0.0, 1.0, 0.5 };
    const double eqPts[] = { 0.5, 0.0, 1.0, 0.5 };

    while (1) {
        printf("DDJ-FLX4> ");
        fflush(stdout);
        if (!fgets(line, sizeof(line), stdin)) break;

        char *p = line;
        while (*p && isspace((unsigned char)*p)) p++;
        char cmd = (char)tolower((unsigned char)*p);
        if (cmd == '\0') continue;

        switch (cmd) {
            case 'q':
                printf("🔌 Unplugging Virtual Pioneer DDJ-FLX4...\n");
                MIDIEndpointDispose(gSource);
                if (gDest) MIDIEndpointDispose(gDest);
                MIDIClientDispose(gClient);
                return 0;
            case 'h':
            case '?':
                printMenu();
                break;
            case 'd':
                runDemoSequence();
                break;
            case 'a':
                sendButton(0, 0x0B, "Deck A Play / Pause");
                break;
            case 'b':
                sendButton(1, 0x0B, "Deck B Play / Pause");
                break;
            case 'c':
                sendButton(0, 0x0C, "Deck A Cue");
                break;
            case 'v':
                sendButton(1, 0x0C, "Deck B Cue");
                break;
            case '1':
                sendButton(6, 0x46, "Load Top Queue Track -> Deck A");
                break;
            case '2':
                sendButton(6, 0x47, "Load Top Queue Track -> Deck B");
                break;
            case 'w':
                sweep14Bit("Deck A Volume Fader", 0, 0x13, 0x33, volPts, 3);
                break;
            case 'x':
                sweep14Bit("Crossfader (A <-> B)", 6, 0x1F, 0x3F, cfPts, 4);
                break;
            case 'e':
                sweep14Bit("Deck A EQ Low", 0, 0x0F, 0x2F, eqPts, 4);
                sweep14Bit("Deck A EQ Mid", 0, 0x0B, 0x2B, eqPts, 4);
                sweep14Bit("Deck A EQ High", 0, 0x07, 0x27, eqPts, 4);
                break;
            case 'j':
                printf("💿 Deck A Jog Wheel Backward (-)\n");
                sendRelativeJog(0, -5, 8);
                break;
            case 'k':
                printf("💿 Deck A Jog Wheel Forward (+)\n");
                sendRelativeJog(0, 5, 8);
                break;
            case 'p':
                sendButton(0, 0x54, "Deck A Headphone Cue (PFL)");
                break;
            case 's':
                sendButton(0, 0x58, "BPM Sync Toggle");
                break;
            case 'l':
                sendButton(7, 0x00, "Performance Pad 1: Laser SFX");
                break;
            case 'f':
                sendButton(7, 0x01, "Performance Pad 2: Air Horn SFX");
                break;
            default:
                printf("Unknown command '%c'. Type 'h' for help or 'd' for full demo sweep.\n", cmd);
                break;
        }
    }

    MIDIEndpointDispose(gSource);
    if (gDest) MIDIEndpointDispose(gDest);
    MIDIClientDispose(gClient);
    return 0;
}
