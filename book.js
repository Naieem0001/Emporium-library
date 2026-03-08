const books = [

{
title: "The Alchemist",
author: "Paulo Coelho",
genre: "fiction",
cover: "alchemist.jfif",
file: "alchemist pdf.pdf",
trending: true
},

{
title: "Atomic Habits",
author: "James Clear",
genre: "non-fiction",
cover: "Atomic Habits.jpg",
file: "Atomic habits pdf.pdf",
trending: true
},

{
title: "1984",
author: "George Orwell",
genre: "fiction",
cover: "https://m.media-amazon.com/images/I/71kXYs4tCvL._AC_UF1000,1000_QL80_.jpg",
file: "1984.pdf",
trending:false
},

{
title: "The Great Gatsby",
author: "F. Scott Fitzgerald",
genre: "literature",
cover: "https://m.media-amazon.com/images/S/compressed.photo.goodreads.com/books/1650033243i/41733839.jpg",
file: "https://drive.google.com/file/d/1E0oBdLXl_rjYG3bqPfxVmguN-C62yQih/view?usp=drive_link",
trending: false
},

{
title: "The Silent Patient",
author: "Alex Michaelides",
genre: "horror-thriller",
cover: "Silient Patient.jpg",
file: "silent patient pdf.pdf",
trending: false
},

{
title: "Rich Dad Poor Dad",
author: "Robert Kiyosaki",
genre: "non-fiction",
cover: "Rich Dad.jfif",
file: "Rich dad pdf.pdf",
trending: false
},
{
title: "Deep Work",
author: "Cal Newport",
genre: "non-fiction",
cover: "deep work.png",
file: "Deep Work pdf.pdf",
trending: false
},


{
title: "Pride and Prejudice",
author: "Jane Austen",
genre: "literature",
cover: "https://m.media-amazon.com/images/I/81a3sr-RgdL.jpg",
file: "https://drive.google.com/file/d/1aMthZpRP-S408KdDd8AgwZY-7H5KaJkx/view?usp=drive_link",
trending: false
},


{
title: "Crime and Punishment",
author: "Fyodor Dostoevsky",
genre: "literature",
cover: "https://upload.wikimedia.org/wikipedia/en/4/4b/Crimeandpunishmentcover.png",
file: "https://drive.google.com/file/d/1o7fOsr4go0vfDlUnrFIxdz8j7ngweDet/view?usp=drive_link",
trending: false
},

{
title: "War and Peace",
author: "Leo Tolstoy",
genre: "literature",
cover: "https://m.media-amazon.com/images/I/81oHM-dzefL._AC_UF1000,1000_QL80_.jpg",
file: "https://drive.google.com/file/d/1OBp8mXGySTW87WHyxvptZNXX5zhx3zy6/view?usp=drive_link",
trending: false
},

{
title: "Hamlet",
author: "William Shakespeare",
genre: "literature",
cover: "https://cdn.kobo.com/book-images/389c6a10-f026-4bbe-a132-34072053689a/353/569/90/False/hamlet-271.jpg",
file: "https://drive.google.com/file/d/1K2THA5OEdTkDzkCfsDHG22KK9m_QhzEQ/view?usp=drive_link",
trending: false
},

{
title: "The Odyssey",
author: "Homer",
genre: "literature",
cover: "https://m.media-amazon.com/images/I/71FC1AcWTKL._AC_UF1000,1000_QL80_.jpg",
file: "https://drive.google.com/file/d/1zFjSka-PIijKwS51j8-BdxMB9JOXNWXT/view?usp=drive_link",
trending: false
},

{
title: "Don Quixote",
author: "Miguel de Cervantes",
genre: "literature",
cover: "https://m.media-amazon.com/images/I/813JpsGOpiL._UF1000,1000_QL80_.jpg",
file: "https://drive.google.com/file/d/1aebYIIDPNlr5Sn59tIIlQwPD7Vw61SjE/view?usp=drive_link",
trending: false
},

{
title: "To Kill a Mockingbird",
author: "Harper Lee",
genre: "literature",
cover: "https://m.media-amazon.com/images/S/compressed.photo.goodreads.com/books/1612238791i/56916837.jpg",
file: "https://drive.google.com/file/d/1YoJcJ9amMwO4V1Zr-MKYJaWGtzRdhuaj/view?usp=drive_link",
trending: false
},

{
title: "The Divine Comedy",
author: "Dante Alighieri",
genre: "literature",
cover: "https://m.media-amazon.com/images/I/51i-9SGWr-L._AC_UF1000,1000_QL80_.jpg",
file: "https://drive.google.com/file/d/1XdnoWBPPDNj_KHnCkpBO5om4nTVVas4D/view?usp=drive_link",
trending: false
},

{
title: "Moby Dick",
author: "Herman Melville",
genre: "literature",
cover: "https://m.media-amazon.com/images/I/712mdW4zCcL._AC_UF1000,1000_QL80_.jpg",
file: "https://drive.google.com/file/d/1aJRHGMs23V08OXrbO_D3mdq3XwRTWcKm/view?usp=drive_link",
trending: false
},

{
title: "Wuthering Heights",
author: "Emily Brontë",
genre: "rom-com",
cover: "https://m.media-amazon.com/images/I/81dvA4tU0rL._AC_UF1000,1000_QL80_.jpg",
file: "https://drive.google.com/file/d/1mRTs-9rBzP7OqFzKzjTUpNrhUgaWowLT/view?usp=drive_link",
trending: false
},

{
title: "Romeo and Juliet",
author: "William Shakespeare",
genre: "rom-com",
cover: "https://m.media-amazon.com/images/I/71tmOG4RrDS._UF1000,1000_QL80_.jpg",
file: "https://drive.google.com/file/d/17OP13mRflYzh5D166_Tm_1arXELKzbca/view?usp=drive_link",
trending: false
},

{
title: "It Ends with Us",
author: "Colleen Hoover",
genre: "rom-com",
cover: "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcSUpxbM-IIARAqAF3YvZ6PlgfCjYygS9XVVpg&s",
file: "it_ends_with_us.pdf",
trending: true
},

{
title: "The Love Hypothesis",
author: "Ali Hazelwood",
genre: "rom-com",
cover: "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcR48C5m986HO4J20RYGqVozTFlTxBuKMFWYhw&s",
file: "https://drive.google.com/file/d/1XHTuL5wQNCMwZChiXPYzV9DXDadAtQrv/view?usp=drive_link",
trending: false
},

{
title: "Red, White & Royal Blue",
author: "Casey McQuiston",
genre: "rom-com",
cover: "https://covers.openlibrary.org/b/isbn/9781250316776-L.jpg",
file: "https://drive.google.com/file/d/1lxjCKIpujdAVFNTD2QIXhvZaPEBm-RzO/view?usp=drive_link",
trending: false
},

{
title: "The Notebook",
author: "Nicholas Sparks",
genre: "rom-com",
cover: "https://covers.openlibrary.org/b/isbn/9780446605236-L.jpg",
file: "https://drive.google.com/file/d/134D_SvHUrhKpQOOl6Mt_gBsW_jg3vHqy/view?usp=drive_link",
trending: false
},

{
title: "Me Before You",
author: "Jojo Moyes",
genre: "rom-com",
cover: "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcS3PvEcOIw7KBPVElT1DyZUPQQhsGHI-109_w&s",
file: "https://drive.google.com/file/d/19hdwzCl-kCieuC3qdYm47CdIFD-Uee7o/view?usp=drive_link",
trending: false
},

{
title: "The Fault in Our Stars",
author: "John Green",
genre: "rom-com",
cover: "https://covers.openlibrary.org/b/isbn/9780142424179-L.jpg",
file: "https://drive.google.com/file/d/1gECqw_mf7_BCf6lqlCB94MlGUViXZWxj/view?usp=drive_link",
trending: false
},

{
title: "Love in the Time of Cholera",
author: "Gabriel Garcia Marquez",
genre: "rom-com",
cover: "https://covers.openlibrary.org/b/isbn/9780307389732-L.jpg",
file: "https://drive.google.com/file/d/1beUYLUrwq7Ognd8ZyvHYVgWu6nf6rmbX/view?usp=drive_link",
trending: false
},

{
title: "Outlander",
author: "Diana Gabaldon",
genre: "rom-com",
cover: "https://covers.openlibrary.org/b/isbn/9780440212560-L.jpg",
file: "https://drive.google.com/file/d/1rL3l2or4rfLni5CN5JBQb7eLtXzl5unZ/view?usp=drive_link",
trending: false
},

{
title: "The Time Traveler's Wife",
author: "Audrey Niffenegger",
genre: "rom-com",
cover: "https://img1.od-cdn.com/ImageType-400/6630-1/74E/2AD/86/%7B74E2AD86-E112-461A-BC1F-6DFE74B9F72E%7DImg400.jpg",
file: "https://drive.google.com/file/d/1rRvqkV9Y4TknIS7oUU5PHrafJ2QFLDDG/view?usp=drive_link",
trending: false
},

{
title: "The Rosie Project",
author: "Graeme Simsion",
genre: "rom-com",
cover: "https://m.media-amazon.com/images/I/71akyIAUObL._AC_UF1000,1000_QL80_.jpg",
file: "https://drive.google.com/file/d/1UNSpkMGmwUoFE7Cauaq8VfRHQ0ix-HkW/view?usp=drive_link",
trending: false
},

{
title: "Let Us C",
author: "Yashavant Kanetkar",
genre: "academic",
cover: "letcimg.jpeg",
file: "letusC.pdf",
trending: false
},

{
title: "Data Structures Using C",
author: "Reema Thareja",
genre: "academic",
cover: "reema.jpg",
file: "datastr.pdf",
trending: false
},

{
title: "Web Development",
author: "Ayush Mauryawanshi",
genre: "academic",
cover: "web dev.jfif",
file: "https://drive.google.com/file/d/13m8LWXBY-1dKNvjzgDQ5TIRyJtZqHwVS/view?usp=drive_link",
trending: false
},

{
title: "Python Tutorial for Beginners",
author: "Tutorial",
genre: "academic",
cover: "python.jfif",
file: "https://drive.google.com/file/d/14P3SwM0YVVzrI0Epe3vDnFx0Xa-Vw9Cw/view?usp=sharing",
trending: false
},

{
title: "Fundamentals of Physics",
author: "Halliday and Resnick",
genre: "academic",
cover: "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcQWGR4jP3H-qqINb9gmEs8ZhyaUyzIkeoke8A&s",
file: "https://dl.icdst.org/pdfs/files4/39e1817b05cf155433309dbb2f3289fe.pdf",
trending: false
},

{
title: "University Physics with Modern Physics",
author: "Young and Freedman",
genre: "academic",
cover: "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcTcoai-hY9nt-EW0iauxy24jcCh3NJCItiVCg&s",
file: "https://www.andrew.cmu.edu/user/bbji/Desktop/University%20Physics%20with%20Modern%20Physics%2015th%20Edition%20By%20Hugh%20D.%20Young_compressed.pdf",
trending: false
},

{
title: "The Feynman Lectures on Physics",
author: "Feyman",
genre: "academic",
cover: "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcT58BaNefNvyWPGSXlEqgn9L0WuHkA5dh2TVw&s",
file: "https://t.me/GDCBaramulla0001/9",
trending: false
},

{
title: "Physics for Scientists and Engineers",
author: "Servay and Jewet",
genre: "academic",
cover: "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcTc3Q4M4haO5MWZp42hujWZFDQu1zr7zOPzfQ&s",
file: "https://t.me/GDCBaramulla0001/10",
trending: false
},

{
title: "Organic Chemistry",
author: "Morrison & Boyd",
genre: "academic",
cover: "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcT4O4ptwGtckcsw-r6f2CDVvAbuoqtbcdVIig&s",
file: "https://t.me/GDCBaramulla0001/11",
trending: false
},

{
title: "Physical Chemistry",
author: "Puri, Sharma & Pathania",
genre: "academic",
cover: "https://m.media-amazon.com/images/I/414-STZUnzL._AC_UF1000,1000_QL80_.jpg",
file: "https://t.me/GDCBaramulla0001/12",
trending: false
},

{
title: "Inorganic Chemistry",
author: "Housecroft",
genre: "academic",
cover: "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcRVqzA1kgbd2OsHTX35gXtmjoz5FdeH2actpQ&s",
file: "https://t.me/GDCBaramulla0001/13",
trending: false
},

{
title: "Invertebrate Zoology",
author: "E. L. Jordan",
genre: "academic",
cover: "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcTNAuZtCU2FTaB9pgLfq7yRY8CR64hbsp1rGA&s",
file: "https://archive.org/download/InvertebrateZoology/InvertebrateZoology.pdf",
trending: false
},

{
title: "Chordate Zoology",
author: "P. S. Verma",
genre: "academic",
cover: "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcSV3kNHyX-WBM_mMW1ozxYBmzQ1bLc2NC4GBw&s",
file: "https://t.me/GDCBaramulla0001/15",
trending: false
},

{
title: "Plant Physiology",
author: "Taiz & Zeiger",
genre: "academic",
cover: "https://images.unsplash.com/photo-1498837167922-ddd27525d352",
file: "https://t.me/GDCBaramulla0001/16",
trending: false
},

{
title: "Plant Anatomy",
author: "B. P. Pandey",
genre: "academic",
cover: "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcRju4No_lz4t_F6YW4SiiT9vGplf9yGtsWcPg&s",
file: "https://t.me/GDCBaramulla0001/17",
trending: false
},

{
title: "Indian Society",
author: "PW IAS",
genre: "academic",
cover: "https://static.pw.live/5eb393ee95fab7468a79d189/GLOBAL_CMS_BLOGS/07af0a8c-1d19-4b30-85ad-a8a23decb705.jpg",
file: "https://t.me/GDCBaramulla0001/18",
trending: false
},

{
title: "Environmental Studies",
author: "Benny Joseph",
genre: "academic",
cover: "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcRCrLUraqBPdmqHvaAcBIYo4dsJzjM3Z6vgfw&s",
file: "https://t.me/GDCBaramulla0001/19",
trending: false
},

{
title: "Indian Polity",
author: "M Laxmikanth",
genre: "academic",
cover: "https://m.media-amazon.com/images/I/71CrTyKsazL._AC_UF1000,1000_QL80_.jpg",
file: "https://t.me/GDCBaramulla0001/20",
trending: false
},


{
title: "The Kite Runner",
author: "Khaled Hosseini",
genre: "fiction",
cover: "https://upload.wikimedia.org/wikipedia/en/6/62/Kite_runner.jpg",
file: "https://t.me/Ebook_Emporium/778",
trending: false
},


{
title: "Sapiens",
author: "Yuval Noah Harari",
genre: "non-fiction",
cover: "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcSlgxZ2oFdx-BVhV5OwyF4fgCQDTAs5ItPBQg&s",
file: "https://t.me/Database00001/226",
trending: false
},

{
title: "Educated",
author: "Tara Westover",
genre: "non-fiction",
cover: "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcSyLF5XHRmtXxn9V34FRTgYpdSOO6afkme14A&s",
file: "https://t.me/Ebook_Emporium/830",
trending: false
},


{
title: "Bell Jar",
author: "Sylvia Plath",
genre: "non-fiction",
cover: "images/belljar.jpg",
file: "https://t.me/Database00001/430",
trending: false
},

{
title: "The Subtle Art of Not Giving a F*ck",
author: "Mark Manson",
genre: "non-fiction",
cover: "images/subtleart.jpg",
file: "https://t.me/Database00001/347",
trending: false
},

{
title: "The Power of Now",
author: "Eckhart Tolle",
genre: "spirituality",
cover: "https://images.unsplash.com/photo-1512820790803-83ca734da794",
file: "https://t.me/GDCBaramulla0001/21",
trending: false
},

{
title: "Autobiography of a Yogi",
author: "Paramahansa Yogananda",
genre: "spirituality",
cover: "https://images.unsplash.com/photo-1507842217343-583bb7270b66",
file: "https://t.me/Ebook_Emporium/654",
trending: false
},

{
title: "The Holy Quran (Translation)",
author: "Tafseer ibn e kaseer",
genre: "religion",
cover: "https://darussalam.in/cdn/shop/files/Tafsir-Ibn-Kathir-10-volumes.webp?v=1749191422",
file: "https://t.me/GDCBaramulla0001/23",
trending: false
},

{
title: "Bhagavad Gita",
author: "W.J Johnson translation",
genre: "religion",
cover: "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcTevkgRqsA7PL6qvho1veaYHbVcYdQklS4K-Q&s",
file: "https://t.me/GDCBaramulla0001/27",
trending: false
},

{
title: "Holy Bible",
author: "Original",
genre: "religion",
cover: "https://cdn.vectorstock.com/i/1000v/56/22/holy-bible-design-vector-4515622.jpg",
file: "https://t.me/GDCBaramulla0001/28",
trending: false
},

{
title: "To Kill a Mockingbird",
author: "Harper Lee",
genre: "fiction",
cover: "https://m.media-amazon.com/images/S/compressed.photo.goodreads.com/books/1612238791i/56916837.jpg",
file: "Books/mocking_bird.pdf",
trending: false
},
//download links not set

{
title: "Brave New World",
author: "Aldous Huxley",
genre: "fiction",
cover: "https://covers.openlibrary.org/b/isbn/9780060850524-L.jpg",
file: "https://drive.google.com/file/d/1Xg_Y5XQKhuhvCCOnzAjN3avEj-kFHoIs/view?usp=drive_link",
trending: false
},

{
title: "The Catcher in the Rye",
author: "J.D. Salinger",
genre: "fiction",
cover: "https://covers.openlibrary.org/b/isbn/9780316769174-L.jpg",
file: "https://drive.google.com/file/d/16SUAA5hE0ah9dfcxxBnWEQBJVFANfA81/view?usp=drive_link",
trending: false
},

{
title: "One Hundred Years of Solitude",
author: "Gabriel Garcia Marquez",
genre: "fiction",
cover: "https://covers.openlibrary.org/b/isbn/9780060883287-L.jpg",
file: "https://drive.google.com/file/d/1Xyg08RJj6s00AH9hMQRB97u7Y8ToJPfL/view?usp=drive_link",
trending: false
},

{
title: "The Road",
author: "Cormac McCarthy",
genre: "fiction",
cover: "https://covers.openlibrary.org/b/isbn/9780307387899-L.jpg",
file: "https://drive.google.com/file/d/1O6TTc2SkiyxrN1Fdi5uTm_czNZZqznOa/view?usp=drive_link",
trending: false
},

{
title: "A Tale of Two Cities",
author: "Charles Dickens",
genre: "fiction",
cover: "https://covers.openlibrary.org/b/isbn/9780141439600-L.jpg",
file: "https://drive.google.com/file/d/1NnodtG9k5tLXEfjg36Dq9P6njHaDYNVy/view?usp=drive_link",
trending: false
},

{
title: "The Count of Monte Cristo",
author: "Alexandre Dumas",
genre: "fiction",
cover: "https://covers.openlibrary.org/b/isbn/9780140449266-L.jpg",
file: "https://drive.google.com/file/d/1sYPEfJY2uAOhA4FSvl1VZg5llZmtoOvx/view?usp=drive_link",
trending: false
},

{
title: "Animal Farm",
author: "George Orwell",
genre: "fiction",
cover: "https://covers.openlibrary.org/b/isbn/9780451526342-L.jpg",
file: "https://drive.google.com/file/d/1mdoCNL42U60ny9YeRtWrtdgNjaVRSmOZ/view?usp=drive_link",
trending: false
},

{
title: "The Stranger",
author: "Albert Camus",
genre: "fiction",
cover: "https://covers.openlibrary.org/b/isbn/9780679720201-L.jpg",
file: "https://drive.google.com/file/d/1sWxuqoFjQIcM7rInj6bD0ckTDXJjrUPO/view?usp=drive_link",
trending: false
},

{
title: "Midnight's Children",
author: "Salman Rushdie",
genre: "fiction",
cover: "https://covers.openlibrary.org/b/isbn/9780812976533-L.jpg",
file: "https://drive.google.com/file/d/1kaNh71IFj10EioasmV6VpJW7SHx5z174/view?usp=drive_link",
trending: false
},

{
title: "Ihya Ulum al-Din",
author: "Imam Al-Ghazali",
genre: "spirituality",
cover: "https://covers.openlibrary.org/b/isbn/9781567445190-L.jpg",
file: "https://drive.google.com/file/d/1cTzdrBcdC-JqBVqR2ipB6IleH8bJNYKI/view?usp=drive_link",
trending: false
},

{
title: "The Alchemy of Happiness",
author: "Imam Al-Ghazali",
genre: "spirituality",
cover: "https://covers.openlibrary.org/b/isbn/9781577311546-L.jpg",
file: "https://drive.google.com/file/d/1mUPsItJQVey2BUKuGnxm_pZHNwCEo7WL/view?usp=drive_link",
trending: false
},

{
title: "In the Early Hours",
author: "Khurram Murad",
genre: "spirituality",
cover: "https://m.media-amazon.com/images/I/61ein2IjQzL._AC_UF1000,1000_QL80_.jpg",
file: "https://drive.google.com/file/d/1OXCIHKDC1qI_yyANboihx9Zo3xxwv8-q/view?usp=drive_link",
trending: false
},

{
title: "The Seven Spiritual Laws of Success",
author: "Deepak Chopra",
genre: "spirituality",
cover: "https://covers.openlibrary.org/b/isbn/9781878424112-L.jpg",
file: "https://drive.google.com/file/d/1UfWTsqWVyqwPNGOscF4zzPYwz_f6mC6h/view?usp=drive_link",
trending: false
},

{
title: "The Untethered Soul",
author: "Michael A. Singer",
genre: "spirituality",
cover: "https://covers.openlibrary.org/b/isbn/9781572245372-L.jpg",
file: "https://drive.google.com/file/d/1Q9Tmpq-mw9BcIEWS7rHT8del86JsGyiV/view?usp=drive_link",
trending: false
},

{
title: "Dune",
author: "Frank Herbert",
genre: "science-fiction",
cover: "https://covers.openlibrary.org/b/isbn/9780441013593-L.jpg",
file: "https://drive.google.com/file/d/1LYChjqb8CMwsmCyduY1w6xk6SUhyDDng/view?usp=drive_link",
trending: false
},

{
title: "Ender's Game",
author: "Orson Scott Card",
genre: "science-fiction",
cover: "https://covers.openlibrary.org/b/isbn/9780812550702-L.jpg",
file: "https://drive.google.com/file/d/1Ao1-mbl62iMFz0AUI0BiSXBiVKsPm4bK/view?usp=drive_link",
trending: false
},

{
title: "The Hitchhiker's Guide to the Galaxy",
author: "Douglas Adams",
genre: "science-fiction",
cover: "https://covers.openlibrary.org/b/isbn/9780345391803-L.jpg",
file: "https://drive.google.com/file/d/1u25zjLKUV1Ndnt8P-LgByhIRe2CmFZ1U/view?usp=drive_link",
trending: false
},

{
title: "Fahrenheit 451",
author: "Ray Bradbury",
genre: "science-fiction",
cover: "https://covers.openlibrary.org/b/isbn/9781451673319-L.jpg",
file: "https://drive.google.com/file/d/1lnevaqnOE7a6mlfZFqSlV6v0g-aUBFx3/view?usp=drive_link",
trending: false
},

{
title: "Neuromancer",
author: "William Gibson",
genre: "science-fiction",
cover: "https://covers.openlibrary.org/b/isbn/9780441569595-L.jpg",
file: "https://drive.google.com/file/d/1AkOm-R9tIe8ZoTVayk4kvY93TzDLnn-w/view?usp=drive_link",
trending: false
},

{
title: "The War of the Worlds",
author: "H.G. Wells",
genre: "science-fiction",
cover: "https://covers.openlibrary.org/b/isbn/9780486295060-L.jpg",
file: "https://drive.google.com/file/d/1c3nfhZFlVBKIHBBWY-SZF0S5QGnfPm7i/view?usp=drive_link",
trending: false
},

{
title: "The Foundation Triology",
author: "Isaac Asimov",
genre: "science-fiction",
cover: "https://covers.openlibrary.org/b/isbn/9780553293357-L.jpg",
file: "https://drive.google.com/file/d/1SqJy9HFiVeEaeAK_K31E_VHg8yE6gMzG/view?usp=drive_link",
trending: false
},

{
title: "The Martian",
author: "Andy Weir",
genre: "science-fiction",
cover: "https://covers.openlibrary.org/b/isbn/9780553418026-L.jpg",
file: "https://drive.google.com/file/d/1Okw8QypQp9gNH46RO39NpBp9ygDaGrJo/view?usp=drive_link",
trending: false
},

{
title: "Project Hail Marry",
author: "Andy Weir",
genre: "science-fiction",
cover: "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcRqgWQXE2ypUFktcSUuBUlJ5-4zGZYHVDiU9g&s",
file: "https://drive.google.com/file/d/1KWZTZb2g7w6hfApmXPQceUap3ek_joeS/view?usp=drive_link",
trending: true
},

{
title: "Interstellar",
author: "Greg Keyes",
genre: "science-fiction",
cover: "https://covers.openlibrary.org/b/isbn/9781783292684-L.jpg",
file: "https://drive.google.com/file/d/1pIv6PkT7lQfmFeZv6o2FEAE7_WVcjekF/view?usp=drive_link",
trending: false
},

{
title: "The Time Machine",
author: "H.G. Wells",
genre: "science-fiction",
cover: "https://covers.openlibrary.org/b/isbn/9780486284729-L.jpg",
file: "https://drive.google.com/file/d/1MhA8vZm5Vc3xC8XRV1gvntZbAHPxCtiE/view?usp=drive_link",
trending: false
},

{
title: "The 7 Habits of Highly Effective People",
author: "Stephen R. Covey",
genre: "non-fiction",
cover: "https://covers.openlibrary.org/b/isbn/9780743269513-L.jpg",
file: "https://drive.google.com/file/d/1AOp88dElrEy8oJVDXIX94uNAU5OItGIz/view?usp=drive_link",
trending: false
},

{
title: "How to Win Friends and Influence People",
author: "Dale Carnegie",
genre: "non-fiction",
cover: "https://covers.openlibrary.org/b/isbn/9780671027032-L.jpg",
file: "https://drive.google.com/file/d/1pIpH-O7VU1NetGTCslb4j0tmWbtGB2kK/view?usp=drive_link",
trending: false
},

{
title: "The Sealed Nectar",
author: "Safir ur Rehman al Mubarakpuri",
genre: "religion",
cover: "https://m.media-amazon.com/images/I/91YHrcQT+3L.jpg",
file: "https://drive.google.com/file/d/1k_Q4bN6g_1q9UpLIZVy-htnQRjH0PQGK/view?usp=sharing",
trending: false
},

{
title: "Explanation of Three fundamental Principals of islam",
author: "Muhammad ibn e salih al uthaymeen",
genre: "religion",
cover: "https://m.media-amazon.com/images/I/51Wgo9phSGL.jpg",
file: "https://drive.google.com/file/d/1XUAoI62je9SVF4ZCidfhwMRL6Ot2WjhL/view?usp=sharing",
trending: false
},

{
title: "Kitab Ul Iman",
author: "Ibn e Taymiyyah",
genre: "religion",
cover: "https://m.media-amazon.com/images/I/614pFvWXnhL._AC_UF1000,1000_QL80_.jpg",
file: "https://drive.google.com/file/d/1D48d1dAMbRxpsjNls_s0NPe0cSWUUSxX/view?usp=sharing",
trending: false
},

{
title: "Explanation of Kitab Ul Tawheed",
author: "Muhammad ibn e Abdul Wahaab",
genre: "religion",
cover: "https://m.media-amazon.com/images/I/511nBs+cTqL._AC_UF1000,1000_QL80_.jpg",
file: "https://drive.google.com/file/d/1grIQEi5kRPT5YmoxTup-7SEzaul7QHLI/view?usp=sharing",
trending: false
},

{
title: "Aab e Hayat",
author: "Umera Ahmad",
genre: "religion",
cover: "https://m.media-amazon.com/images/S/compressed.photo.goodreads.com/books/1420365972i/23486520.jpg",
file: "https://drive.google.com/file/d/1smvHR_v93RJgaS5it9Dx83K1aFVxCKZz/view?usp=sharing",
trending: false
},

{
title: "Man's Search for Meaning",
author: "Viktor E. Frankl",
genre: "non-fiction",
cover: "https://covers.openlibrary.org/b/isbn/9780807014271-L.jpg",
file: "https://drive.google.com/file/d/1DJbeZm0KMpGaiDNtLSqEgCYeLOGL_UHJ/view?usp=drive_link",
trending: false
},

{
title: "It",
author: "Stephen King",
genre: "horror-thriller",
cover: "https://covers.openlibrary.org/b/isbn/9781501156700-L.jpg",
file: "YOUR_DRIVE_LINK",
trending: false
},

{
title: "The Shining",
author: "Stephen King",
genre: "horror-thriller",
cover: "https://covers.openlibrary.org/b/isbn/9780307743657-L.jpg",
file: "https://drive.google.com/file/d/1sCa0s3GzEEeIyoYaegf-Wko5XtqfzSLK/view?usp=drive_link",
trending: false
},

{
title: "Gone Girl",
author: "Gillian Flynn",
genre: "horror-thriller",
cover: "https://covers.openlibrary.org/b/isbn/9780307588364-L.jpg",
file: "https://drive.google.com/file/d/1CBj9Tbb1mfbjRQG4MvVvGUbVP4eGEl2H/view?usp=drive_link",
trending: false
},

{
title: "The Girl with the Dragon Tattoo",
author: "Stieg Larsson",
genre: "horror-thriller",
cover: "https://covers.openlibrary.org/b/isbn/9780307454546-L.jpg",
file: "https://drive.google.com/file/d/1SQ3C3BaaszZky5Q86LxAvWijLECEW0a6/view?usp=sharing",
trending: false
},

{
title: "Rebecca",
author: "Daphne du Maurier",
genre: "horror-thriller",
cover: "https://covers.openlibrary.org/b/isbn/9780380730407-L.jpg",
file: "https://drive.google.com/file/d/1LjPCIfp9HVQO0A4IbkphFjVW4sgXxoQK/view?usp=drive_link",
trending: false
},

{
title: "The Teacher",
author: "Freida MC Freida",
genre: "horror-thriller",
cover: "Teacher.jpg",
file: "https://drive.google.com/file/d/1CNjh1ZuN3iEqvIi5VRccEIrh_yf9SHy9/view?usp=drive_link",
trending: false
},


{
title: "Frankenstein",
author: "Mary Shelley",
genre: "horror-thriller",
cover: "https://covers.openlibrary.org/b/isbn/9780486282114-L.jpg",
file: "https://drive.google.com/file/d/18nhuLIXgOeYejm-QWYIh_jKcvUwTCbZb/view?usp=drive_link",
trending: false
},

{
title: "The Da Vinci Code",
author: "Dan Brown",
genre: "horror-thriller",
cover: "https://covers.openlibrary.org/b/isbn/9780307474278-L.jpg",
file: "https://drive.google.com/file/d/1BNqKvHgyCrC2_Ht-oGzmY5j-Ry1ypLpW/view?usp=drive_link",
trending: false
},

{
title: "In the Woods",
author: "Tana French",
genre: "horror-thriller",
cover: "https://covers.openlibrary.org/b/isbn/9780143113492-L.jpg",
file: "https://drive.google.com/file/d/1KtIWuNvYeV1kVXpFQeBChOJk9NfyLNr4/view?usp=drive_link",
trending: false
},
{
title: "Dracula",
author: "Bram Stoker",
genre: "horror-thriller",
cover: "https://covers.openlibrary.org/b/isbn/9780486411095-L.jpg",
file: "https://drive.google.com/file/d/1l9XlKhJFyBxaDkur6wBUwjVGQDg9P-dV/view?usp=drive_link",
trending: false
},

{
title: "Peer e Kamil",
author: "Umera Ahmad",
genre: "religion",
cover: "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcSF7qMkglCDLwhscwtm9Mjyh_CbnNVAtOiIXQ&s",
file: "https://drive.google.com/file/d/1nTGbk_sCTDMFmDiXYaVdoqJ1Tl1RjBrl/view?usp=sharing",
trending: false
}


];
