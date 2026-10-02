import type { Candidate } from "./game";

/** Personal stories are conversation, never evidence of a hidden ability or hiring motive. */
export type ScoutingStory = { title: string; work: readonly string[]; background: readonly string[] };
export const SCOUTING_STORIES: readonly [readonly ScoutingStory[], readonly ScoutingStory[], readonly ScoutingStory[]] = [
  [
    {
      title: "Midnight maintenance",
      work: ["There’s a small café that uses the library I maintain. Once, the owner sent me a photograph of a receipt instead of a bug report. She had circled the wrong total with a pastry pencil.", "I keep that photograph in the project folder. When I’ve been staring at a screen too long, it reminds me where the numbers eventually end up."],
      background: ["My first computer had a broken hinge. You had to prop the screen against a stack of cookbooks. I learned to keep a backup because my little brother kept taking the bottom book.", "I still cook from those books. The computer is long gone, but apparently a good soup recipe lasts forever."],
    },
    {
      title: "The blue button",
      work: ["I once spent an afternoon watching a man use one of my prototypes. He kept reaching for a button I’d put on the wrong side of the screen. Neither of us said anything for a while.", "On the tram home I sketched the whole thing again. That version had an enormous blue button. It looked a little ridiculous, and I was rather fond of it."],
      background: ["My grandmother had a radio with a strip of raised tape across the volume dial. She could find her favourite station without looking. I used to think every radio came that way.", "When I started making things, I found myself looking for that strip of tape. Some small sign that someone had thought about the person using it."],
    },
    {
      title: "The spare kettle",
      work: ["We have a kettle at the repair table that technically belongs to nobody. It has moved between four community halls and a borrowed garage. Somebody always packs it before the tools.", "People bring broken lamps, sewing machines, sometimes a bag of parts with no explanation. We make tea, clear a space, and start by asking what happened."],
      background: ["The first thing I helped repair was my neighbour’s garden gate. I mostly held the screws. Afterwards she gave me a jar of plum jam as if I’d rebuilt her entire house.", "I still stop at that gate on the way home. It needs painting now. There’s always something."],
    },
    {
      title: "A folder full of diagrams",
      work: ["Every project seems to leave me with a different sort of diagram. There are boxes, arrows, little notes from meetings where the coffee ran out. I have a cupboard full of them.", "I tried to put the cupboard in order last weekend. By lunchtime I was reading an old margin note about somebody’s lost umbrella. I never did finish sorting it."],
      background: ["My father used to iron his work shirts on Sunday evenings with the radio on. I liked the rhythm of it. A small ritual that said the week was about to begin.", "I still iron on Sundays. Even when I’m working from home and absolutely nobody is going to see the shirt."],
    },
    {
      title: "The unfinished notebook",
      work: ["There’s a page in my notebook with nine drawings of the same welcome screen. The first one is very confident. By the ninth, the arrows have become increasingly apologetic.", "I’ve taped a bus ticket over the corner where I spilled coffee. It’s now part of the layout. I’ll probably miss it when the project finally lives on a screen."],
      background: ["I used to draw maps for my younger cousins when they visited. They were maps of very ordinary things: where we kept the cereal, which cupboard had the good blankets.", "I made one for my first student flat, too. Mostly to remember which light switch belonged to which room."],
    },
    {
      title: "The borrowed office",
      work: ["For a while our office was the back room of a print shop. Meetings had to pause whenever the big printer started. We learned to put the important part of a sentence before the noise.", "I still have a box of badly cut business cards from that place. Every card is a slightly different shape. Nobody ever seemed to mind."],
      background: ["I moved here with two suitcases and a list of people somebody thought I should meet. The list was written on the back of a restaurant menu.", "I ended up eating at the restaurant before meeting anyone. Good soup. The menu is still folded in my wallet."],
    },
    {
      title: "Between repair tickets",
      work: ["The shop’s old inventory book had a thumbprint on every page. Mine is on the page for spare hinges. I wrote the first version of the tool at the counter, between a toaster and a customer’s cracked laptop.", "We still keep the book under the till. Sometimes my mother writes a note in it because she prefers the sound of a pen."],
      background: ["I spent school holidays in the shop. My job was to sort the tiny screws into trays. I invented a numbering system that only I understood, which caused a certain amount of trouble.", "Now the trays have labels. I made the labels large enough to read from the other side of the counter."],
    },
    {
      title: "A crate marked fragile",
      work: ["A child asked why an exhibit had a button if nothing moved when she pressed it. That was a fair question. We’d spent so long testing the wiring that I’d forgotten the little pause at the beginning.", "We added a soft light during the pause. Now children wait for it, and sometimes press the button with their friends."],
      background: ["My favourite museum visit was on a rainy school trip. A technician opened the back of an exhibit to fix it while we watched. I was more interested in the open panel than the exhibit.", "There were pencil marks inside the cabinet. I liked knowing that a person had been there before us."],
    },
    {
      title: "The morning loading dock",
      work: ["The loading dock has a different sound before the first truck arrives. Just a ventilation fan, a radio somewhere, and wheels on the concrete. I usually walk through once before it gets busy.", "Someone has drawn a small sun beside the morning-shift column. Nobody knows who started it. We keep drawing it when the board gets wiped."],
      background: ["My mother kept a grocery list folded in her apron pocket. She never wrote things in aisle order, so we’d make two or three laps around the shop.", "I loved those laps. The list was only half the reason we went. We always found somebody she knew."],
    },
    {
      title: "A puzzle on the train",
      work: ["I carry a little book of programming problems on the train. Sometimes I reach my stop with nothing on the page except a drawing of the carriage.", "There’s one problem I’ve been returning to for months. The book’s spine has started to split at that page. I’ve repaired it with green thread."],
      background: ["We had a chessboard with a missing knight when I was young. A small plastic dinosaur stood in for it. I liked the dinosaur so much that we kept using it after finding the proper piece.", "It still lives on my desk. Usually somewhere it isn’t supposed to be."],
    },
    {
      title: "The rehearsal room",
      work: ["When I practise a presentation, I put a houseplant in the chair across from me. It’s a very forgiving audience. It has endured some quite long explanations of typography.", "The case studies begin as loose photographs on my floor. I move them around for a few evenings before putting anything in the portfolio."],
      background: ["My uncle ran a small cinema. I helped change the posters on Thursdays. You could always see the outline of the previous week’s poster in the glass.", "I still like that sort of thing: a polished surface with a little trace of what came before."],
    },
    {
      title: "The waiting room clock",
      work: ["There’s a clock behind the reception desk that runs a minute slow. I’ve tried replacing the battery. It goes back to being a minute slow by the following week.", "When the waiting room gets crowded, someone usually asks me about it. Then we have something harmless to talk about while I find their appointment."],
      background: ["I used to take my aunt to her appointments. She would pack a thermos and enough biscuits for everyone we might conceivably meet.", "I thought it was excessive. Now I keep an extra packet in the desk drawer. She would be delighted to know that."],
    },
  ],
  [
    {
      title: "Weather in the margins",
      work: ["I write the weather in the margin of my field notebook. At first it was part of the observations. Now I also write things like ‘forgot gloves’ or ‘a dog sat on the equipment case.’", "There’s a damp ring across one of the pages. I can still remember the bench where I set the flask down. Some details remain much clearer than the equations."],
      background: ["My mother kept a thermometer outside the kitchen window. Every morning she tapped the glass before reading it, whether or not that helped.", "I catch myself doing the same thing with instruments that don’t remotely need tapping. Habits find their way into the lab."],
    },
    {
      title: "The label maker",
      work: ["I label nearly everything in a prototype. Cables, boxes, the one switch you shouldn’t press while making tea. At some point somebody labelled the label maker.", "It was a good joke. I left it there. There’s something comforting about entering a complicated room and knowing where the ordinary things are."],
      background: ["A neighbour let me take apart a broken record player one summer. I expected to find music inside. Instead there was a belt, some wires, and quite a lot of dust.", "For years afterwards I wanted to make something that looked as ordinary as that record player from the outside."],
    },
    {
      title: "The packing list",
      work: ["Before a field trip I lay the equipment out on the floor. Someone always points out that we’ve packed three things to measure wind and only one spoon.", "The spoon goes on the list now. So does a roll of decent tape. Our packing lists are becoming a history of things we once forgot."],
      background: ["My family used to take the same long drive each summer. My father had a route written out, but we’d stop whenever somebody saw a promising picnic table.", "I still look for those tables. Sometimes the best part of a planned journey is the place you didn’t put on the itinerary."],
    },
    {
      title: "Chalk on the cuff",
      work: ["There’s always chalk on this jacket. Even when the room has a screen. I find myself sketching something on the little board beside the door while people are still arriving.", "After a lecture I like to leave the board up for a while. Occasionally somebody adds a question, or corrects the shape of an arrow."],
      background: ["My first lecture took place in a room with a radiator that knocked all the way through it. I thought it was applause at first. A rather generous interpretation.", "I still have the notes. The first sentence is underlined three times, as if that would stop me forgetting it."],
    },
    {
      title: "The tin of spare parts",
      work: ["Most of the small parts live in biscuit tins. One is labelled ‘possibly useful,’ which is an absurdly broad category. The lid no longer fits.", "I try to leave a note beside each thing I take apart. Not a proper report. Just where a wire went, or what made the room smell faintly of toast."],
      background: ["I once fixed a lamp with my grandfather. We worked on a newspaper at the kitchen table, and the ink ended up all over our hands.", "He made me wash before we tested it. I remember being impatient. Now that pause is one of my favourite parts of the memory."],
    },
    {
      title: "After the room empties",
      work: ["I often stay behind after a project presentation. There are cups to gather, cables to coil, and usually a question someone preferred to ask without a microphone.", "The empty room feels very different from the room in the slides. I sometimes make a note of that before going home."],
      background: ["My first fundraising event was a jumble sale for a leaking community-centre roof. I spent most of the morning trying to explain why a box of mismatched mugs needed a good home.", "One of the mugs is still on my desk. It has a bird on it that nobody can identify."],
    },
    {
      title: "Two kinds of notebook",
      work: ["I keep one notebook for numbers and another for drawings. They refuse to remain separate. There are leaves beside the equations and diagrams where I intended to sketch a flower.", "The paper in the drawing book is nicer. That may explain more of the overlap than any grand theory."],
      background: ["A teacher once asked us to press a plant between the pages of a book. I chose a book of multiplication tables because it was heavy.", "When I found it years later, the flower was almost transparent. A few petals were still caught on the page for sevens."],
    },
    {
      title: "Night shift at the dome",
      work: ["The observatory has a kettle that whistles louder than any alarm. On a quiet night you can hear it from the far end of the corridor.", "I usually make two cups, even when I’m on my own. The second one stands beside the window until it gets cold. A habit from overlapping shifts."],
      background: ["I came here for a temporary job. On the first evening somebody handed me a torch and asked if I’d like to see the dome opening.", "I hadn’t brought a coat. I stood there freezing and forgot to ask when the temporary job was supposed to end."],
    },
    {
      title: "A pencil map",
      work: ["I draw the shape of a project before I write a memo. Who sits where, where a message goes, which questions keep circling back to the beginning.", "The first map is usually wrong. I leave the erased lines faintly visible. They remind me that the neat version came later."],
      background: ["I worked in a bookshop with a very complicated till. The owner had written instructions on cards and taped them to every surface.", "When I left, I took a photograph of the counter. It looked chaotic. To us it was a perfectly ordinary way of getting through the day."],
    },
    {
      title: "The question jar",
      work: ["There’s a jar on my desk full of folded questions. Things I didn’t have time to follow up, or things I couldn’t quite phrase when someone asked.", "On Fridays I open one. Sometimes it turns out to be a shopping reminder. I’ve become less certain about which bits of paper belong in which jar."],
      background: ["I remember a school experiment with a tray of water and a lamp. The whole class gathered round to look at a pattern on the wall.", "What stayed with me was the pause before anyone explained it. For a moment we were all just looking at the same strange thing."],
    },
    {
      title: "The wooden prototype",
      work: ["Before a machine exists, there’s usually a wooden model on my table. I move its pieces around until the room is full of shavings.", "The first version of the last prototype is still under the bench. It has a wheel borrowed from a toy. I can’t quite bring myself to take it apart."],
      background: ["My aunt had a sewing machine built into a table. I loved the way an entire mechanism could fold away and become an ordinary piece of furniture.", "I wanted my first invention to do that. It didn’t fold away. It mostly occupied the kitchen."],
    },
    {
      title: "The tea tray",
      work: ["One lab I worked with had meetings that lasted through lunch. I started bringing a tray of tea and a plate of whatever was in the staff kitchen.", "It became part of the meeting. Someone would pour, someone would move the papers, and the conversation would find a slightly different shape."],
      background: ["I volunteered at a theatre one summer. During rehearsals my job was to write down where the chairs had been, then put them back after everyone left.", "By the last week I knew who liked which chair. I still think about that whenever I’m setting up a room."],
    },
  ],
  [
    {
      title: "The station at dusk",
      work: ["They asked me to keep a log of what happens at the station. Mostly it contains very ordinary things. A damaged timetable. A man trying to keep a newspaper open in the wind.", "I like writing those parts down too. If I only recorded the unusual things, it wouldn’t resemble the place I actually spend my evenings."],
      background: ["I used to miss this train on purpose so I could sit a little longer on the platform. There’s a patch of warm stone at the end of the bench.", "The station has been repainted twice since then. The bench is the same. I hope they leave it alone."],
    },
    {
      title: "A chair by the door",
      work: ["When people ask me about the room, I start with the furniture. There are five chairs, a tired fern, and a door that sticks when it rains.", "That sounds irrelevant until you’ve been asked the same question all afternoon. It helps to remember a room can simply be a room."],
      background: ["I used to host Sunday dinners. Everybody brought something, and we’d argue gently about whether the table needed another leaf.", "One friend always arrived with bread still warm from the bakery. I miss that more than the dinners themselves."],
    },
    {
      title: "Still water in a chipped bowl",
      work: ["There’s a chipped bowl on the sill here. I fill it for the little plant beside the window. It is apparently very difficult to kill this kind of plant, but I remain cautious.", "When people visit, they often watch the bowl before they watch me. I suppose it gives us something to look at while we decide what to say."],
      background: ["My sister and I used to skip stones at the reservoir. I was very bad at it. Mine went straight down with a surprisingly satisfying sound.", "She still sends me photographs of flat stones when she finds a particularly good one."],
    },
    {
      title: "The newspaper drawer",
      work: ["I keep newspaper clippings in a drawer with a postcard of the coast. Every time I sort them, the postcard turns up somewhere different.", "There are dates on the backs of some pieces and shopping lists on others. The drawer is overdue for a proper afternoon’s attention."],
      background: ["When I was small, I liked reading the weather page before looking out of the window. It was a pleasant little ceremony, even when the page was from yesterday.", "I still buy a paper on long journeys. The act of unfolding it makes the seat feel like a place I can stay for a while."],
    },
    {
      title: "The quieter table",
      work: ["I have been writing down what I remember after a crowded day. Sometimes it’s an exact sentence. Sometimes it’s only the way somebody held a cup.", "I sit at the table by the wall to do it. There’s a loose thread on the chair cover that I keep winding around my finger."],
      background: ["At school I took the long way home past a little shop that sold stationery. The owner let me try the pens if I promised to put their caps back.", "I bought this notebook there. Most of the early pages are elaborate versions of my own initials."],
    },
    {
      title: "The old brass handle",
      work: ["I notice doors now. The weight of them, the way a latch catches, which handle somebody has polished by using it every day.", "This building has a brass handle on the back entrance. It feels warm in the late afternoon. I make a point of leaving through that door when I can."],
      background: ["My brother and I painted our bedroom door in alternating stripes. We had no permission and very little paint. The final stripe was almost transparent.", "Our parents left it like that. I used to be embarrassed by it. Now I’m glad nobody covered it up."],
    },
    {
      title: "A line beneath the text",
      work: ["I copy the difficult pages by hand sometimes. Not to decode them. To spend enough time with them that I notice the paper and the marks around the edges.", "One document has a tea stain shaped a little like a bird. I’ve drawn it in the margin of my copy. It felt rude to leave it out."],
      background: ["My grandfather sent letters in a handwriting nobody else could read. My mother would lay them on the table and we would puzzle over one line together.", "I kept the envelopes. The return address never changed, but he wrote it differently every time."],
    },
    {
      title: "Cups on the long table",
      work: ["I tend to ask people where they would like to sit. It is such a small question, but you can tell when somebody has been waiting to be asked.", "There’s a cupboard of mismatched cups here. I let visitors choose. The one with the painted pear is inexplicably popular."],
      background: ["My mother used to leave the porch light on until everyone was home. On summer evenings we’d sit under it because the air was cooler outside.", "I remember the insects around the bulb and the sound of the last bus going past. Very little happened. Those evenings are still clear to me."],
    },
    {
      title: "The tape on the floor",
      work: ["The floor has more tape on it than it used to. I help draw the room plans, and somebody transfers the lines to the concrete. We disagree about which colour is easiest to see.", "I leave a small gap around the stool where I drink tea. On the plan it looks unnecessarily precise. In the room it feels ordinary."],
      background: ["We had a garden with a little fence made from salvaged wood. I helped my father space the posts. None of them was perfectly straight.", "There’s a photograph of me beside the finished fence, holding a tape measure as though I personally invented it."],
    },
    {
      title: "The drawing before breakfast",
      work: ["I keep a pencil beside the bed. If I reach for my phone first, the shape I wanted to draw usually disappears while I’m reading a message.", "The sketchbooks have ordinary things mixed in with the strange ones. A kettle. A stairwell. A place to put the bin. That’s what most places are made of, after all."],
      background: ["I once drew my aunt’s house from memory and gave it an extra window. She liked the extra window so much that she kept the drawing on her fridge.", "I still look at that wall when I visit. Part of me expects it to have changed."],
    },
    {
      title: "The folded umbrella",
      work: ["People expect some grand explanation when we sit down. Sometimes I’d rather begin with the weather. It makes the room feel less like a stage.", "I brought an umbrella today. The forecast was clear, but I’d left it at a café twice already and decided it ought to spend some time with its owner."],
      background: ["I worked in a small shop that sold used musical instruments. You could hear somebody practising the same four notes for an entire afternoon.", "There was a battered clarinet nobody bought. I sometimes wonder whether it ever found a player who liked the sound of it."],
    },
    {
      title: "The clean blanket",
      work: ["I keep a clean blanket folded at the end of the bench. When everything feels unfamiliar, something as ordinary as a blanket can be a useful thing to offer.", "After a shift I check the cupboard, refill the kettle, and put the chairs back. Then I sit down for a moment before turning the lights off."],
      background: ["My first medical bag was a hand-me-down with a stubborn zip. The person who gave it to me had tied a piece of blue cord to the pull.", "I moved the cord to the new bag when the old one wore out. It would feel strange to leave home without it."],
    },
  ],
];

/** Generated recruits inherit one of the same twelve written profile backgrounds. */
export function scoutingStoryFor(candidate: Pick<Candidate, "id">): ScoutingStory | null {
  const match = /^t([0-2])-(\d+)$/u.exec(candidate.id);
  if (!match) return null;
  const index = Number(match[2]);
  if (!Number.isSafeInteger(index) || index < 0) return null;
  return SCOUTING_STORIES[Number(match[1]) as 0 | 1 | 2][index % 12] ?? null;
}
