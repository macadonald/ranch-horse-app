export type HorseSize = 'small' | 'medium' | 'large' | 'draft'
export type HorseStatus = 'active' | 'out' | 'lame' | 'backup' | 'donotuse' | 'naughty'

export interface Horse {
  name: string
  level: string
  weight: number | null
  size: HorseSize
  status: HorseStatus
  notes: string
  excludeFromAI?: boolean
  rankLast?: boolean
}

export const HORSES: Horse[] = [
  { name: "68",          level: "AB",   weight: 180,  size: "medium", status: "active",    notes: "Good with older women. Good all around horse, extremely reliable, can take just about anyone. Might be a tad bit much for an extremely new rider." },
  { name: "Adobe",       level: "B",    weight: 185,  size: "medium", status: "out",       notes: "Kid horse (Out). Gets older kids usually, typically 12-16 year old girls, some boys." },
  { name: "Amarillo",    level: "B",    weight: 150,  size: "small",  status: "active",    notes: "Kid Horse. Slower, more stubborn kids horse, walks pretty slow, have to crop to get into a lope." },
  { name: "Amigo",       level: "B",    weight: 200,  size: "medium", status: "lame",      notes: "Lame." },
  { name: "Aviator",     level: "AI",   weight: 210,  size: "medium", status: "lame",      notes: "Lame." },
  { name: "Barb",        level: "I",    weight: 200,  size: "medium", status: "active",    notes: "Good with older, stiffer guys. Typically see her with guys around 30-55 yrs old. Sometimes gets older women." },
  { name: "Barbie",      level: "I",    weight: 170,  size: "medium", status: "active",    notes: "Must be light on the mouth and hold good body position. Very smart horse, fast and a good listener. Definitely better with someone who really knows what they're doing." },
  { name: "Bat",         level: "AB",   weight: 150,  size: "small",  status: "active",    notes: "Good with old women who mark themselves A/AI. Super sweet, can take good kicks or a crop to get going but will get going. Can be a pretty slow walker/loper." },
  { name: "Big Wyatt",  level: "AI",   weight: 275,  size: "draft",  status: "active",    notes: "Big draft horse, the most advanced draft on ranch. Best placed between AI and A level riders — can take AIs but is best in that AI-to-A range. He is fast. Do not use for lower levels." },
  { name: "Bison",       level: "B",    weight: 230,  size: "large",  status: "active",    notes: "Very reliable bigger horse. Takes pretty big people, mostly beginners and advanced beginners. Almost always has a bigger person on him. Can be stubborn to get going, usually needs to be cropped." },
  { name: "Bonanza",     level: "B",    weight: 230,  size: "large",  status: "out",       notes: "Out. One of the most reliable bigger horses that isn't a draft. Can take really big guests of all levels, always keeps them safe, never causes problems. Typically has bigger beginner/advanced beginners. Needs good kicking or to be cropped to go faster." },
  { name: "Bravo",       level: "B",    weight: 300,  size: "draft",  status: "active",    notes: "Older, very large and tall clydesdale. Can take some of the biggest guests. Pretty slow walker, one of the faster male drafts of this size. Needs big kicks or to be cropped." },
  { name: "Britt",       level: "AB",   weight: 180,  size: "medium", status: "active",    notes: "Very reliable horse that gets beginner riders of all shapes and sizes. Gets bigger riders but not the biggest. Wide range of male and females. Sometimes stubborn in the arena, usually needs a couple crops at first to go, then is fine." },
  { name: "Buster",      level: "B",    weight: 130,  size: "small",  status: "active",    notes: "Really old kids horse, only used when all other kids horses are being used, kind of a last option. Gets really small kids and occasionally a small grandma." },
  { name: "Cactus",      level: "AB",   weight: 200,  size: "large",  status: "active",    notes: "Old horse that gets mostly beginners and advanced beginners. Gets bigger guests because he is a bigger horse." },
  { name: "Camacho",     level: "B",    weight: 175,  size: "medium", status: "active",    notes: "Kid Horse. Really old horse who is particularly smooth. Gets beginner riders. Lately getting mostly kids with the occasional larger adult." },
  { name: "Chance",      level: "I",    weight: 165,  size: "medium", status: "active",    notes: "Shorter horse but fat. Gets mostly intermediate to advanced intermediate riders, maybe an occasional advanced beginner. Mostly women/older women." },
  { name: "Chief",       level: "B",    weight: 250,  size: "draft",  status: "active",    notes: "Draft horse that gets a lot of advanced beginners, beginners, and intermediate. Lots of men and women but more women, especially shorter larger women. Might not be the best option for nervous riders because he likes his personal space and will sometimes bite/kick out at other horses." },
  { name: "Chile",       level: "AI",   weight: 210,  size: "large",  status: "active",    notes: "Bigger horse who gets advanced and advanced intermediate riders. Typically mostly guys with occasional woman. Doesn't seem the most comfortable horse, you have to pull back pretty hard to get him to slow down or stop." },
  { name: "Chuy",        level: "B",    weight: 160,  size: "small",  status: "active",    notes: "Kid. One of the most reliable horses on ranch, a bit smaller. Great option for nervous riders or extreme beginners or people with limiting injuries. Also a great kids horse." },
  { name: "Colonel",     level: "AB",   weight: 200,  size: "medium", status: "out",       notes: "Out." },
  { name: "Comanche",    level: "B",    weight: 190,  size: "large",  status: "active",    notes: "Kid. Gets mostly kids with occasional adult. Gets mostly beginners and some advanced beginners. One of the bigger kids horses." },
  { name: "Corona",      level: "AB",   weight: 160,  size: "medium", status: "active",    notes: "Gets mostly beginners and advanced beginners, probably more advanced beginners. Reliable horse that might need a crop to get him going." },
  { name: "Custer",      level: "B",    weight: 200,  size: "medium", status: "active",    notes: "VERY SPECIFIC RIDER ONLY. This horse does not go fast and cannot be used as a main option — program must use him only in very special cases. Does not behave when asked to go faster. Typically assigned to guests who explicitly only want to walk. Not a default assignment." },
  { name: "Dante",       level: "AB",   weight: 180,  size: "medium", status: "active",    notes: "Good with weird men/women. Mostly women or 12-17 year old kids on him. Definitely a stubborn horse who you really have to crop/kick to get going. But still very reliable safety wise." },
  { name: "Dolly",       level: "I",    weight: 180,  size: "medium", status: "active",    notes: "No short fat people. Mostly see women on her, gets mostly intermediate-advanced intermediate rider. Some pretty young girls who are more experienced riders do really well on her. If she has a younger person, its typically an older teen." },
  { name: "Dondo",       level: "AI",   weight: 170,  size: "medium", status: "active",    notes: "No really old people. Great option for riders who are genuinely higher level riders, does not do well with riders closer to intermediate. Definitely prefers riders with lighter hands. Mostly women, typically ages 30-60." },
  { name: "Dorado",      level: "AB",   weight: 200,  size: "large",  status: "active",    notes: "One of the biggest horses that isn't a draft. Wide range of riders — beginner, advanced beginner, or intermediate. Very smooth horse, mostly see with larger men but occasionally bigger women." },
  { name: "Dozer",      level: "I",    weight: 325,  size: "draft",  status: "active",    notes: "Big draft horse. Does well with I's and AI's, in some cases AB if no advanced options are available at that weight range. Faster draft horse." },
  { name: "Dually",     level: "AB",   weight: 325,  size: "draft",  status: "active",    notes: "Tallest draft on ranch, carries a lot of weight. Best fit with AB and I riders, could accommodate some beginners as well." },
  { name: "Finch",       level: "X",    weight: null, size: "medium", status: "naughty",   notes: "Naughty. Do not use." },
  { name: "Flame",       level: "AI",   weight: 200,  size: "large",  status: "active",    notes: "Definitely a faster horse, mostly Advanced, Advanced Intermediate, and maybe occasional bigger intermediate rider. Should ideally stick with advanced and advanced intermediate. Definitely prefers riders with softer hands. Wide variety of men and women." },
  { name: "Forest",     level: "AI",   weight: 215,  size: "large",  status: "active",    notes: "Tall thoroughbred-size horse, very fast, needs soft hands. Really only gets AI's and A's — not suited for lower-level riders." },
  { name: "Ghost",       level: "AB",   weight: 200,  size: "large",  status: "active",    notes: "Slow walker that takes a lot of hard cropping to get going. Typically see beginner and advanced beginner male riders. Rarely seen with a female rider. Takes a lot to get going but can get going pretty fast once he's moving. Also seen with a lot of the larger riders." },
  { name: "Gonzales",    level: "I",    weight: 175,  size: "medium", status: "active",    notes: "Older horse who cannot carry heavy weights — keep riders well under max. Strong emphasis on female riders; lighter guests preferred. Gets primarily advanced beginner and lower-intermediate riders. Very good horse but can go a little fast at first." },
  { name: "Guinness",    level: "B",    weight: 220,  size: "large",  status: "active",    notes: "Kid Horse. Very old horse that can get kids. Getting pretty old and doesn't do as strongly with really big riders. Ideal that his rider doesn't reach max weight but not necessary." },
  { name: "Hans",        level: "AB",   weight: 180,  size: "small",  status: "active",    notes: "A little strong for advanced beginner riders. Meshes better with intermediate riders, or considerably experienced advanced beginner. Fast short pony that sometimes has too much go." },
  { name: "Hobo",        level: "I",    weight: 180,  size: "medium", status: "active",    notes: "Extremely responsive old horse. Lope is pretty comfortable but some riders can not find the right way to sit his lope. Gets a wide range of female and male riders, but mostly older riders." },
  { name: "Hollywood",   level: "AB",   weight: 175,  size: "medium", status: "active",    notes: "Good horse for ABs. Solidly built horse, can be pretty stubborn, usually needs a crop but then will go consistently. Likes his personal space. Gets a variety of male and female guests." },
  { name: "Hoss",        level: "B",    weight: 200,  size: "large",  status: "active",    notes: "Bigger horse who gets a lot of beginners and advanced beginners, with an occasional intermediate. Gets males and females, not many young people." },
  { name: "Houdini",     level: "AB",   weight: 175,  size: "medium", status: "active",    notes: "Smaller very reliable horse that can take riders of all sizes and riding levels. Mostly see him with older women or male and female kids from 12-16 years. Sometimes goes after other horses so might not be the best horse for a nervous rider." },
  { name: "Huckleberry", level: "B",    weight: 180,  size: "large",  status: "active",    notes: "Bigger horse who gets mostly men with an occasional woman. Tend to see quite a few older men on this horse but overall gets riders of all sizes and ages." },
  { name: "Javelina",    level: "I",    weight: 180,  size: "medium", status: "active",    notes: "Gets mostly intermediate female riders with an occasional male rider. Good girl that can sometimes be too much for a rider that leans more towards advanced beginner." },
  { name: "Jellybean",   level: "AB",   weight: 175,  size: "medium", status: "active",    notes: "Very reliable horse that gets mostly beginner and advanced beginner riders. Seldom will throw his head down the arena with guest but it doesn't happen much and people usually love riding him. Mostly seen with female guests of all ages." },
  { name: "Jet",         level: "B",    weight: 180,  size: "large",  status: "active",    notes: "Bigger horse who is very reliable, gets a lot of beginners and advanced beginners with some intermediates mixed in. Wide range of male and female riders. Can handle some of the bigger guests." },
  { name: "Jetta",       level: "AB",   weight: 220,  size: "draft",  status: "active",    notes: "Smooth horse and a draft. Sweet large horse who gets mostly beginners and advanced beginners. Need to crop her a bit to get going but always takes care of her guests and is extremely reliable. Both men and women ride her but probably more men overall. Draft horse so she gets some pretty big guests." },
  { name: "JJ",          level: "B",    weight: 160,  size: "medium", status: "active",    notes: "Kid Horse. All around very reliable horse. Can take riders of all sizes and riding levels. Very level headed and doesn't really ever have issues with anyone. Mostly women or boy and girl kids ages 12-16." },
  { name: "Juanita",     level: "AI",   weight: 145,  size: "medium", status: "active",    notes: "Light 145. Gets mostly intermediate/advanced intermediate riders, closer to intermediate. Mostly see older women on her, specifically ones who have indicated themselves to be a high riding level, but maybe their age and bodies don't reflect that." },
  { name: "Jupiter",     level: "AB",   weight: 200,  size: "large",  status: "active",    notes: "Gets primarily advanced beginner and intermediate riders, a little much for straight beginner riders. Also gets a lot of the bigger riders, especially ones that want to do more fast things." },
  { name: "Knox",        level: "B",    weight: 175,  size: "medium", status: "active",    notes: "Kid. One of the most reliable kids horses we have, really only gets small kids, roughly ages 5-13. Really never causes issues and kids love him." },
  { name: "Kodiak",      level: "I",    weight: 190,  size: "large",  status: "out",       notes: "Out." },
  { name: "Lad",         level: "B",    weight: 175,  size: "medium", status: "lame",      notes: "Lame. Great horse that mostly gets beginners and advanced beginners. One of the most heard comments about this horse is that he trips sometimes." },
  { name: "Laredo",      level: "B",    weight: 175,  size: "medium", status: "active",    notes: "Kid Horse. Extremely reliable kids horse that takes primarily kids from ages 5-13. Every once in a while he will get an older grandma on him. Usually needs a crop to get him going." },
  { name: "Later",       level: "AB",   weight: 200,  size: "medium", status: "active",    notes: "Good for nervous riders. Very reliable horse that gets mostly beginners and advanced beginners. Can get impatient when asked to stand still and will toss his head so might not be the best assignment for a nervous rider but could use him for that nervous rider if needed." },
  { name: "Latigo",      level: "B",    weight: 300,  size: "draft",  status: "active",    notes: "Big old draft horse that mostly gets very big male guests that tend to just do slow rides. Definitely capable of doing fast rides. Gets Beginners and Advanced Beginners." },
  { name: "Loosey",      level: "AI",   weight: 170,  size: "medium", status: "active",    notes: "Very reliable faster horse. Loved by riders that know what they're doing. Gets mostly intermediate to advanced intermediate riders with an occasional advanced beginner that seems like they might lean intermediate. Mostly females." },
  { name: "Marlboro",    level: "I",    weight: 185,  size: "medium", status: "active",    notes: "Very reliable faster horse. Gets mostly intermediate to advanced intermediate riders with an occasional advanced beginner that seems like they might lean intermediate. Mostly females." },
  { name: "Max",         level: "AI",   weight: 160,  size: "small",  status: "active",    notes: "Weird horse but a good horse. Not really used as a primary option, kind of falls as a last resort type of horse because he is skinny. If we need to use him, he is good to go. Mostly females." },
  { name: "Mesquite",    level: "B",    weight: 200,  size: "large",  status: "active",    notes: "Bigger horse that is very reliable. Gets a lot of bigger guests because he is a bigger horse. Predominantly see beginners, advanced beginners, and intermediate riders on him. Extreme beginners don't fit with him all the time because he might try to walk them home, but could use him for an extreme beginner if needed." },
  { name: "MnM",        level: "AI",   weight: 190,  size: "medium", status: "active",    notes: "Very good horse for riders who know what they are doing, soft hands required. Gets mostly AI's and A's, some higher-end I's." },
  { name: "Moon",        level: "I",    weight: 220,  size: "large",  status: "active",    notes: "Bigger horse seen with bigger guests, male or female. Not the most comfortable horse to ride and sometimes gets impatient. Mostly intermediate to advanced intermediate riders on him." },
  { name: "Nueve",       level: "I",    weight: 180,  size: "medium", status: "donotuse",  notes: "Don't use." },
  { name: "Ocho",        level: "AB",   weight: 180,  size: "medium", status: "active",    notes: "Very reliable horse who walks very slow on slow rides but goes normally fast on the faster rides. Might every once in a while have an intermediate rider." },
  { name: "Ocotillo",    level: "B",    weight: 150,  size: "small",  status: "active",    notes: "Better with Kids. Primarily a kids horse who kids usually love. Slower horse because he's older but goes plenty fast for the kids. Every once in a while will get a small/light woman on him. Usually has kids from ages 7-15." },
  { name: "Pepe",        level: "AI",   weight: 180,  size: "medium", status: "active",    notes: "Great horse that walks pretty slow, especially in the mountains. Can handle himself on a fast ride and goes a lot faster in team penning when he's chasing cows." },
  { name: "Phoenix",     level: "B",    weight: 180,  size: "medium", status: "active",    notes: "Kid. Kids horse who is a pretty slow walker and takes some really hard kicks or a lot of cropping to get going, but will eventually go. Gets a lot of older people, especially more nervous ones, and when its needed gets kids. Some people don't like him because he can be hard to get going." },
  { name: "Poncho",     level: "AI",   weight: 220,  size: "large",  status: "active",    notes: "Needs a rider that knows what they are doing. Avoid putting many older people on him. Mostly advanced riders with some AI's." },
  { name: "Ranger",      level: "AB",   weight: 230,  size: "draft",  status: "active",    notes: "Draft horse, big but definitely not the biggest out of all the drafts. Mostly see beginners, advanced beginners, and the occasional intermediate rider. Primarily gets male guests, with an occasional bigger female." },
  { name: "Rawhide",     level: "B",    weight: 250,  size: "draft",  status: "active",    notes: "Big but old draft horse. Definitely better for slower rides although he can go fast. Gets a lot of older men, and some very old men. Occasionally gets a woman rider." },
  { name: "Red Rock",    level: "AB",   weight: 200,  size: "medium", status: "active",    notes: "Medium sized horse that gets a lot of beginners and advanced beginners. Mostly see men of all ages on him, very few females ride him." },
  { name: "Repeat",      level: "B",    weight: 180,  size: "medium", status: "active",    notes: "Good for nervous riders. Incredibly sweet and is most ideal for people who aren't wanting to go fast. He can go fast and will lope if cropped. Gets a lot of females and some males. Can take teenage kids." },
  { name: "Rhinestone",  level: "B",    weight: 230,  size: "draft",  status: "active",    notes: "Can be older kids horse. Draft mare, pretty slow walker and loper but very reliable. Needs good kicks and crops to get going. Gets a wide range of bigger people, lately she's been dropping weight so ideally the lighter the big people the better." },
  { name: "Ringo",       level: "I",    weight: 180,  size: "medium", status: "active",    notes: "Very reliable horse that isn't too fast and not too slow. Very midline. Almost all of his guests love him. Sometimes has days where he's a little bit faster and gets excited in team penning. Gets mostly intermediate riders, with some advanced intermediates. Mostly women ride him, seldom do you see men riding him." },
  { name: "Roanie",      level: "AI",   weight: 145,  size: "medium", status: "backup",    notes: "Light 145. Really only for slow rides. Hasn't been doing fast rides, so he is really an option only when needed, when there's not too many options left. Should be considered as a back up option." },
  { name: "Rocky",       level: "AI",   weight: 170,  size: "medium", status: "active",    notes: "Faster AI horse. Mostly see higher intermediates and advanced intermediates. Sometimes those older women who mark advanced. Primarily females riding him. Have also seen some younger boys and girls ride him ages 15 and up." },
  { name: "Rojo",        level: "I",    weight: 175,  size: "medium", status: "active",    notes: "Middle of the line horse who isn't too fast or too slow. Both men and women ride him. Mostly intermediates and advanced beginners." },
  { name: "Romeo",       level: "AB",   weight: 160,  size: "small",  status: "active",    notes: "Small horse. Mostly gets teenagers, specifically teenage girls. Also gets a lot of smaller women. Doesn't usually get old women. Very quick in team penning. Mostly advanced beginner and intermediate riders." },
  { name: "Rubito",      level: "B",    weight: 160,  size: "small",  status: "active",    notes: "Kid Horse. Great kids horse and gets kids of all ages. Known to be smooth. Mostly see beginner or advanced beginner kids on him. More girls than boys." },
  { name: "Ruger",       level: "I/AI", weight: 165,  size: "medium", status: "active",    notes: "Fast horse. Does better with advanced intermediates or a higher end intermediate. Mostly female riders. Many ages, including as low as 16 yrs." },
  { name: "Rummel",      level: "AI",   weight: 170,  size: "medium", status: "active",    notes: "Faster horse. Gets advanced and advanced intermediate riders. Is a lot of horse and needs good riders, but the good riders love him. He is afraid of cows so we swap him when his rider is doing sorting or penning." },
  { name: "Rustler",     level: "I",    weight: 180,  size: "medium", status: "active",    notes: "Faster horse that gets mostly intermediate riders. Also gets some advanced intermediates and occasionally some advanced beginners. Slower fast on fast rides and faster on penning, but fast all together. See males and females riding this horse, on average over 30 years of age." },
  { name: "Sarge",       level: "I",    weight: 160,  size: "medium", status: "active",    notes: "Good with Teenagers. Middle of the line reliable horse. Gets male and female riders, but more females. Can also take teenagers. Typically see intermediate riders, advanced beginner, and beginner riders ride this horse." },
  { name: "Sherman",     level: "B",    weight: 300,  size: "draft",  status: "active",    notes: "270-300 lbs ok. One of the fattest and biggest drafts. Does fast and slow and takes some of the biggest riders. Takes a lot of cropping to get going and isn't the fastest loper but will go. Gets a wide variety of very large males and females." },
  { name: "Sierra",      level: "AB",   weight: 160,  size: "small",  status: "active",    notes: "Smaller mare. Older and sometimes trips so she is not the first option but can be used whenever needed. Gets mostly smaller female riders." },
  { name: "Sirius",      level: "I/AI", weight: 210,  size: "large",  status: "active",    notes: "Taller horse. Can go fast or slow depending on the rider. Loves his personal space and will go after other horses so he can't have nervous riders and is best with someone who knows how to stop that. If we go near his cinch when someone is on him he will bite and do mini rears. Gets larger/taller men and women. Gets intermediate, advanced intermediate and sometimes advanced riders." },
  { name: "Skipper",     level: "A",    weight: 220,  size: "large",  status: "active",    notes: "Needs rider with softer hands. Bigger horse who doesn't like his cinch being touched and will pin his ears. Not the best option for nervous riders. Mostly gets advanced riders, and some advanced intermediates. Primarily female riders that are larger." },
  { name: "Speedy",      level: "I",    weight: 150,  size: "small",  status: "active",    notes: "Smaller older horse. Mostly see kids and old women on him. Mostly gets intermediate and advanced beginner riders. Definitely better with a lighter guest." },
  { name: "Splash",     level: "I",    weight: 175,  size: "small",  status: "active",    notes: "Solid option for I's, AI's, and some A's, maybe older A's. Smaller horse." },
  { name: "Stetson I",   level: "B",    weight: 120,  size: "small",  status: "active",    notes: "Kids or very small grandma only. Very good kids horse who almost always only gets kids, except every once in awhile when no one else is available, he will get a very light grandma. Gets a variety of boys and girls." },
  { name: "Surprise",    level: "I",    weight: 230,  size: "draft",  status: "active",    notes: "Bigger horse, part draft. Very fast and leans more on the side of advanced intermediate. Gets larger, higher end intermediates, advanced intermediates, and advanced riders. Both men and women ride her, but more women than men." },
  { name: "Swift",       level: "B",    weight: 210,  size: "large",  status: "active",    notes: "Older slower horse. Can take bigger riders. Mostly seen with beginners and advanced beginners. More male riders than female. Needs good crops or kicks to get going." },
  { name: "Tango",       level: "A",    weight: 200,  size: "large",  status: "active",    notes: "One of the most advanced horses. Very fat and definitely needs someone who knows what they are doing and has ridden a lot and for a while. Mostly gets very experienced female riders." },
  { name: "Thunder",     level: "B",    weight: 180,  size: "small",  status: "active",    notes: "Kid Horse. One of the fastest little kids horses. Very reliable and mostly gets kids. In a pinch can be used for a very light person, typically females." },
  { name: "Titan",       level: "B",    weight: 165,  size: "medium", status: "active",    notes: "Kid Horse. Older kids horse that doesn't go up the mountains and we don't use him in the summer. Not a first option horse, leans more when needed. Gets kids and teens of all ages and gets both males and females." },
  { name: "Tonto",       level: "B",    weight: 180,  size: "medium", status: "active",    notes: "Kid Horse. Gets some heavier people but not the heaviest. Has also started taking more kids. Very reliable and needs good kicks and crops to get going. Gets a variety of males and females of different sizes." },
  { name: "Tortuga",     level: "B",    weight: 180,  size: "medium", status: "active",    notes: "Older horse who is also slower in the lope and the walk. Gets riders male and female of all shapes and sizes. Mostly beginner and advanced beginner riders. Can also take younger teens." },
  { name: "Tucker I",    level: "B",    weight: 80,   size: "small",  status: "active",    notes: "5-8 year olds only. This kids horse is definitely only used when needed. Really only does slow rides for very small kids and only when absolutely necessary and there is no other option." },
  { name: "Vex",         level: "B",    weight: 180,  size: "medium", status: "active",    notes: "Kids/teens with light hands. Mostly gets teenagers. Can be weird about some things so it's better if his rider has at least a little bit of experience. Gets beginners, advanced beginners, and some intermediates." },
  { name: "Voodoo",     level: "AI",   weight: null, size: "medium", status: "active",    notes: "Rarely used — about 1 guest per year rides him. Treat like Roan. MANUAL ASSIGNMENT ONLY — do not include in AI suggestion pool. Never show in Horse Swap or Assign All suggestions.", excludeFromAI: true },
  { name: "Weaver",     level: "I",    weight: null, size: "medium", status: "active",    notes: "A little bit slower but very good and responsive. Gets mostly AB's and I's, some AI's." },
  { name: "Willow",     level: "I",    weight: null, size: "medium", status: "active",    notes: "Fast but good. Does great with I's and AI's, would do well with some AB's." },
  { name: "Wilson",     level: "I",    weight: null, size: "medium", status: "active",    notes: "Solid I option, could get higher AB's and some AI's." },
  { name: "Wink",       level: "AB",   weight: null, size: "medium", status: "active",    notes: "Good horse, gets mostly B, AB, and some younger I's. Not best for really little kids." },
  { name: "Wrangler",   level: "AI",   weight: null, size: "medium", status: "active",    notes: "Good AI option, more AI than I. Fast and responsive, needs someone who knows how to ride. Will occasionally take an A in the right circumstance." },
  { name: "Zen",        level: "AI",   weight: null, size: "large",  status: "active",    notes: "Ex race horse, very fast. Gets AI's and I's, bigger thoroughbred mare." },
  { name: "Zion",       level: "AI",   weight: 190,  size: "medium", status: "active",    notes: "LAST RESORT — should be considered the absolute last option in AI suggestions. Older horse, body not made up the best way, not the most comfortable ride. Rank last in all suggestions.", rankLast: true },
]

export const ACTIVE_HORSES = HORSES.filter(h =>
  h.status === 'active' || h.status === 'backup'
)

export const LEVEL_ORDER = [
  'B',
  'AB',
  'I',
  'I/AI',
  'AI',
  'A',
]

export const LEVEL_LABELS: Record<string, string> = {
  'B':    'Beginner',
  'AB':   'Advanced Beginner',
  'I':    'Intermediate',
  'I/AI': 'Intermediate / Adv Intermediate',
  'AI':   'Advanced Intermediate',
  'A':    'Advanced',
}

// ─── Supabase-backed horse types (used after migration to horses table) ────────

export interface DbHorseFlag {
  id: string
  horse_name: string
  flag_type: 'lame' | 'injured' | 'day_off' | 'in_training' | 'retired'
  notes: string | null
  flagged_at: string
  day_off_date: string | null
  status: 'active' | 'resolved'
  legacy?: boolean
}

export interface DbShoeFlag {
  id: string
  horse_name: string
  what_needed: string
  notes: string | null
}

export interface DbHorse {
  id: string
  name: string
  level: string
  weight: number | null
  size: HorseSize
  notes: string
  is_active: boolean
  exclude_from_ai: boolean
  rank_last: boolean
  is_deceased: boolean
  created_at: string
  updated_at: string
  flags: DbHorseFlag[]
  shoe_flags: DbShoeFlag[]
}
